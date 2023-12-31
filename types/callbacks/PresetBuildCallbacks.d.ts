import { PresetBuildController } from "../controllers/PresetBuildController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IPresetBuildActionRequestData } from "../models/eft/presetBuild/IPresetBuildActionRequestData";
import { WeaponBuild } from "../models/eft/profile/IAkiProfile";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
export declare class PresetBuildCallbacks {
    protected httpResponse: HttpResponseUtil;
    protected presetBuildController: PresetBuildController;
    constructor(httpResponse: HttpResponseUtil, presetBuildController: PresetBuildController);
    /** Handle client/handbook/builds/my/list */
    getHandbookUserlist(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<WeaponBuild[]>;
    /** Handle SaveBuild event */
    saveBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse;
    /** Handle RemoveBuild event*/
    removeBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse;
}
