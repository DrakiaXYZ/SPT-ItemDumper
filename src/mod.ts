import { DependencyContainer } from "tsyringe";
import * as fs from 'fs';
import * as path from 'path';
import * as json5 from 'json5';

import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { LocaleService } from "@spt-aki/services/LocaleService";

import { BaseClasses } from "@spt-aki/models/enums/BaseClasses"
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";

import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";

class Mod implements IPostDBLoadMod
{
    private itemHelper: ItemHelper;
    private localeService: LocaleService;
    private tables: IDatabaseTables;
    private logger: ILogger;
    private items: Record<string, ITemplateItem>;

    private itemOverrides;
    private collidedEnumKeys = [];

    public postDBLoad(container: DependencyContainer): void 
    {
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");

        this.itemHelper = container.resolve<ItemHelper>("ItemHelper");
        this.localeService = container.resolve<LocaleService>("LocaleService");

        this.tables = databaseServer.getTables();
        this.items = this.tables.templates.items;
        this.logger = container.resolve<ILogger>("WinstonLogger");

        this.itemOverrides = this.loadConfig("../config/itemOverrides.json5");

        const itemsObject = {};
        for (const item of Object.values(this.items))
        {
            if (!this.isValidItem(item)) continue;

            const itemParentName = this.getParentName(item);
            const itemPrefix = this.getItemPrefix(item);
            let itemName = this.getItemName(item);
            const itemSuffix = this.getItemSuffix(item);

            // Handle the case where the item starts with the parent category name. Avoids things like 'POCKETS_POCKETS'
            if (itemParentName == itemName.substring(1, itemParentName.length + 1) && itemPrefix == "")
            {
                itemName = itemName.substring(itemParentName.length + 1);
                if (itemName.length > 0 && itemName.at(0) != '_')
                {
                    itemName = `_${itemName}`;
                }
            }

            let itemKey = `${itemParentName}${itemPrefix}${itemName}${itemSuffix}`;

            // Strip out any remaining special characters
            itemKey = this.sanitizeEnumKey(itemKey);

            // If the key already exists, see if we can add a suffix to both this, and the existing conflicting item
            if (Object.keys(itemsObject).includes(itemKey) || this.collidedEnumKeys.includes(itemKey))
            {
                // Keep track, so we can handle 3+ conflicts
                this.collidedEnumKeys.push(itemKey)

                const itemNameSuffix = this.getItemNameSuffix(item);
                if (itemNameSuffix)
                {
                    // Try to update the old key reference if we haven't already
                    if (itemsObject[itemKey])
                    {
                        const oldItemId = itemsObject[itemKey];
                        const oldItemNameSuffix = this.getItemNameSuffix(this.items[oldItemId]);
                        if (oldItemNameSuffix)
                        {
                            const oldItemNewKey = this.sanitizeEnumKey(`${itemKey}_${oldItemNameSuffix}`);
                            delete itemsObject[itemKey];
                            itemsObject[oldItemNewKey] = oldItemId;
                        }
                    }

                    itemKey = this.sanitizeEnumKey(`${itemKey}_${itemNameSuffix}`);

                    // If we still collide, log an error
                    if (Object.keys(itemsObject).includes(itemKey))
                    {
                        this.logger.error(`After rename, itemsObject already contains ${itemKey}  ${itemsObject[itemKey]} => ${item._id}`);
                    }
                }
                else
                {
                    this.logger.error(`itemsObject already contains ${itemKey}  ${itemsObject[itemKey]} => ${item._id}`);
                    continue;
                }
            }

            itemsObject[itemKey] = item._id;
        }

        // Sort the items object
        let orderedItemsObject = Object.keys(itemsObject).sort().reduce(
            (obj, key) => {
                obj[key] = itemsObject[key];
                return obj;
            }, {}
        );

        //this.logger.info(JSON.stringify(itemsObject, null, 4));
        this.writeObjectToFile("../src/items.json", orderedItemsObject);
    }

    private sanitizeEnumKey(enumKey: string): string
    {
        return enumKey.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    }

    private getParentName(item: ITemplateItem): string
    {
        if (item._props.QuestItem)
        {
            return 'QUEST';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.BARTER_ITEM))
        {
            return 'BARTER';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.THROW_WEAPON))
        {
            return 'GRENADE';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.STIMULATOR))
        {
            return 'STIM';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE))
        {
            return 'MAGAZINE';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.KEY_MECHANICAL))
        {
            return 'KEY';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MOB_CONTAINER))
        {
            return 'SECURE';
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.SIMPLE_CONTAINER))
        {
            return 'CONTAINER';
        }
        // This is a special case for the signal pistol, I'm not adding it as a Grenade Launcher
        else if (item._id == '620109578d82e67e7911abf2')
        {
            return 'SIGNALPISTOL';
        }
        

        let parentId = item._parent;
        return this.items[parentId]._name.toUpperCase();
    }

    private isValidItem(item: ITemplateItem): boolean
    {
        const shrapnelId = "5943d9c186f7745a13413ac9";

        if (item._type !== "Item") {
            return false;
        }

        if (item._proto === shrapnelId) {
            return false;
        }

        return true;
    }

    private getItemPrefix(item: ITemplateItem): string
    {
        let prefix = '';

        // Prefix ammo with its caliber
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO))
        {
            prefix = this.getAmmoPrefix(item);
        }
        // Prefix ammo boxes with its caliber
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO_BOX))
        {
            prefix = this.getAmmoBoxPrefix(item);
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE))
        {
            prefix = this.getMagazinePrefix(item);
        }

        // Make sure there's an underscore separator
        if (prefix.length > 0 && prefix.at(0) != "_")
        {
            prefix = `_${prefix}`;
        }

        return prefix;
    }

    private getItemSuffix(item: ITemplateItem): string
    {
        let suffix = '';

        // Add mag size for magazines
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE))
        {
            suffix = item._props.Cartridges[0]?._max_count?.toString() + "RND";
        }
        // Add pack size for ammo boxes
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO_BOX))
        {
            suffix = item._props.StackSlots[0]?._max_count.toString() + "RND";
        }

        // Add "DAMAGED" for damaged items
        if (item._name.toLowerCase().includes("damaged"))
        {
            suffix += "_DAMAGED";
        }

        // Make sure there's an underscore separator
        if (suffix.length > 0 && suffix.at(0) != "_")
        {
            suffix = `_${suffix}`;
        }

        return suffix;
    }

    private getAmmoPrefix(item: ITemplateItem): string
    {
        let prefix = item._props.Caliber.toUpperCase();

        return this.cleanCaliber(prefix);
    }

    private cleanCaliber(ammoCaliber: string): string
    {
        ammoCaliber = ammoCaliber.replace('CALIBER', '');
        ammoCaliber = ammoCaliber.replace('PARA', '');
        ammoCaliber = ammoCaliber.replace('NATO', '');

        // Special case for 45ACP
        ammoCaliber = ammoCaliber.replace('1143X23ACP', '45ACP');

        return ammoCaliber;
    }

    private getAmmoBoxPrefix(item: ITemplateItem): string
    {
        let ammoItem = item._props.StackSlots[0]?._props.filters[0].Filter[0];

        return this.getAmmoPrefix(this.items[ammoItem]);
    }

    private getMagazinePrefix(item: ITemplateItem): string
    {
        let ammoItem = item._props.Cartridges[0]?._props.filters[0].Filter[0];

        return this.getAmmoPrefix(this.items[ammoItem]);
    }

    private getItemName(item: ITemplateItem): string
    {
        let itemName;

        // Manual item name overrides
        if (this.itemOverrides[item._id])
        {
            itemName = this.itemOverrides[item._id].toUpperCase();
        }
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.LOCKABLE_CONTAINER))
        {
            itemName = this.localeService.getLocaleDb()[`${item._id} Name`]?.toUpperCase();
        }
        else
        {
            itemName = this.localeService.getLocaleDb()[`${item._id} ShortName`]?.toUpperCase();
        }
        
        if (!itemName) {
            this.logger.debug(`Unable to get shortname for ${item._id}`);
            return "";
        }
        
        itemName = itemName.replace(/[-.()]/g, '');
        itemName = itemName.replace(/[ ]/g, '_');

        return `_${itemName}`;
    }

    private getItemNameSuffix(item: ITemplateItem): string
    {
        let itemName = this.localeService.getLocaleDb()[`${item._id} Name`];

        // Add grid size for lootable containers
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.LOOT_CONTAINER))
        {
            return `${item._props.Grids[0]?._props.cellsH}X${item._props.Grids[0]?._props.cellsV}`;
        }

        // Add ammo caliber to conflicting weapons
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.WEAPON))
        {
            const caliber = this.cleanCaliber(item._props.ammoCaliber.toUpperCase());

            // If the item has a bracketed section at the end of its name, include that
            const itemNameBracketSuffix = itemName?.match(/\((.+?)\)$/);
            if (itemNameBracketSuffix)
            {
                return `${caliber}_${itemNameBracketSuffix[1]}`;
            }

            return caliber;
        }

        // For random loot containers, we'll need to use their internal name, since they all share a localized name
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.RANDOM_LOOT_CONTAINER))
        {
            return item._name;
        }

        // Make sure we have a full name
        if (!itemName) {
            return "";
        }
        
        // If the item has a bracketed section at the end of its name, use that
        const itemNameBracketSuffix = itemName.match(/\((.+?)\)$/);
        if (itemNameBracketSuffix)
        {
            return itemNameBracketSuffix[1];
        }

        // If the item has a number at the end of its name, use that
        const itemNameNumberSuffix = itemName.match(/#([0-9]+)$/);
        if (itemNameNumberSuffix)
        {
            return itemNameNumberSuffix[1];
        }

        return "";
    }

    private loadConfig(configPath): any
    {
        const configAbsolutePath = path.join(__dirname, configPath);
        const configContents = fs.readFileSync(configAbsolutePath, 'utf-8');
        const config = json5.parse(configContents);
    
        return config;
    }

    private writeObjectToFile(outputPath, data): void
    {
        if (typeof data != 'string')
        {
            data = JSON.stringify(data, null, 4);
        }

        const outputAbsolutePath = path.join(__dirname, outputPath);
        fs.writeFileSync(outputAbsolutePath, data, 'utf-8');
    }
}
module.exports = {mod: new Mod()}