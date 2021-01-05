import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";

/**
 * Settings as displayed in the preferences pane and used to configure the chart
 */
export class Settings extends dataViewObjectsParser.DataViewObjectsParser {
    public invertColours: InvertColours = new InvertColours();
    public axisScaling: AxisScaling = new AxisScaling();
    public tickFormat: TickFormat = new TickFormat();
}

export class InvertColours {
    public show: boolean = false;
}

export class AxisScaling {
    public show: boolean = false;
    public lower: number = 0;
    public upper: number = 2;
}

export class TickFormat {
    public show: boolean = false;
    public x: string = "";
    public y: string = "";
    public bucketIsDate: boolean = false;
}
