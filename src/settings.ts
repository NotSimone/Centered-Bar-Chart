import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";

/**
 * Settings as displayed in the preferences pane and used to configure the chart
 */
export class SettingsParser extends dataViewObjectsParser.DataViewObjectsParser {
    public chartSettings: ChartSettings = new ChartSettings();
    public axisScaling: AxisScaling = new AxisScaling();
    public tickFormat: TickFormat = new TickFormat();
}

export class ChartSettings {
    public toggle: boolean = false;
}

export class AxisScaling {
    public show: boolean = false;
    public lower: number = 0;
    public upper: number = 2;
}

export class TickFormat {
    public x: string = "";
    public y: string = "";
}
