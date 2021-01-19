import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";

/**
 * Settings as displayed in the preferences pane and used to configure the chart
 */
export class Settings extends dataViewObjectsParser.DataViewObjectsParser {
    public margins: Margins = new Margins();
    public invertColours: InvertColours = new InvertColours();
    public axisScaling: AxisScaling = new AxisScaling();
    public tickFormat: TickFormat = new TickFormat();
    public tooltipFormat: TooltipFormat = new TooltipFormat();
    public bucketIsDate: BucketIsDate = new BucketIsDate();
    public labels: Labels = new Labels();
}

export class Margins {
    public top: number = 20;
    public right: number = 20;
    public left: number = 50;
    public bottom: number = 40;
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
    public y: string = ".0%";
}

export class TooltipFormat {
    public show: boolean = true;
    public measure: string = ".0%";
    public target: string = ".0%";
    public difference: string = ".0%";
    public invertDifference: boolean = false;
    public bucket: string = "";
}

export class BucketIsDate {
    public show: boolean = false;
}

export class Labels {
    public show: boolean = true;
    public format: string = ".0%";
    public dynamicScale: boolean = true;
    public manualScale: number = 1;
}
