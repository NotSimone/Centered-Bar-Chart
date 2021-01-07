import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";

/**
 * Settings as displayed in the preferences pane and used to configure the chart
 */
export class Settings extends dataViewObjectsParser.DataViewObjectsParser {
    public invertColours: InvertColours = new InvertColours();
    public axisScaling: AxisScaling = new AxisScaling();
    public tickFormat: TickFormat = new TickFormat();
    public tooltipFormat: TooltipFormat = new TooltipFormat();
    public bucketIsDate: BucketIsDate = new BucketIsDate();
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
    public show: boolean = true;
    public x: string = "";
    public y: string = "~%";
}

export class TooltipFormat {
    public show: boolean = true;
    public measure: string = "~%";
    public target: string = "~%";
    public difference: string = "~%";
    public invertDifference: boolean = false;
    public bucket: string = "";
}

export class BucketIsDate {
    public show: boolean = false;
}
