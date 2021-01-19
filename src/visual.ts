/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "regenerator-runtime/runtime";
import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import { Settings } from "./settings";
import { createTooltipServiceWrapper, TooltipEventArgs, ITooltipServiceWrapper, TooltipEnabledDataPoint } from "powerbi-visuals-utils-tooltiputils";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;
import VisualUpdateType = powerbi.VisualUpdateType;


export class Visual implements IVisual {
    // PBI interactions
    private host: IVisualHost;
    private selectionManager: ISelectionManager;

    // HTML element
    private svg: Selection<SVGElement>;
    private container: Selection<SVGElement>;

    // Configuration
    private colour = { positive: "green", negative: "red" };

    // Current settings
    private containerWidth: number = null;
    private containerHeight: number = null;

    // Axis scalers
    // ref: https://github.com/d3/d3-scale
    private x: any;
    private y: any;

    private data: DataPoint[];
    private dataMeasureMax: number;
    private dataMeasureMin: number;
    private dataTargetMax: number;
    private dataTargetMin: number;

    private settings: Settings = new Settings();
    private tooltipServiceWrapper: ITooltipServiceWrapper;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
        this.selectionManager = this.host.createSelectionManager();
        this.svg = d3.select(options.element)
            .append("svg")
            .on("click", () => {
                if (event.defaultPrevented) return;
    
                this.selectionManager.clear();
                this.redraw(null);
            })
        this.container = this.svg.append("g");
    }

    /**
     * Called by PowerBi to handle chart properties
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        return Settings.enumerateObjectInstances(this.settings, options);
    }

    /**
     * Called by PowerBi whenever the chart is updated
     * @param options 
     */
    public update(options: VisualUpdateOptions) {
        this.updateSettings(options);
        this.fetchData(options);
        this.resize(options);

        this.regenerateAxes();

        // Update the bars
        // Binds data
        let bars = this.container.selectAll(".bar")
            .data(this.data);

        // Configure the generation of bars
        bars.enter()
            .append("rect")
                .attr("x", (d) => { return this.x(String((<DataPoint> d).bucket)) })
                .attr("width", this.x.bandwidth())
                .attr("y", (d) => { return this.y((<DataPoint> d).target) })
                .attr("height", 0 )
                .attr("class", "bar")
            .on("click", (d) => {
                // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                if (this.host.allowInteractions) {
                    this.selectionManager.select(d.selectionId)
                    this.redraw(null);
                    event.preventDefault();
                }
            });
        // Remove entries when no longer needed
        bars.exit()
            .remove();

        // Labels
        let labels = this.container.selectAll(".label")
            .data(this.data);
        
        labels.enter()
            .append("text")
                .attr("x", (d) => { return this.x(String((<DataPoint> d).bucket)) + this.x.bandwidth()/2; })
                .attr("y", (d) => { return this.y((<DataPoint> d).target); })
                .attr("class", "label")
                .style("display", "none")
                .style("text-anchor", "middle");
        
        labels.exit()
            .remove();

        this.renderTooltip();
        this.redraw(options);
    }
    
    /**
     * Loads tooltips
     * Since this gets multiple times without unloading, this could be a memory leak
     * Dont know how it works under the hood and microsoft doesnt provide a way of freeing
     * so its probably okay
     */
    private renderTooltip() {
        this.tooltipServiceWrapper.addTooltip(
            this.container.selectAll("rect"),
            (tooltipEvent: DataPoint) => {
                let measure: string|number = tooltipEvent.measure;
                let target: string|number = tooltipEvent.target;
                let bucket: string|number|Date = tooltipEvent.bucket;
                let difference: string|number = (this.settings.tooltipFormat && this.settings.tooltipFormat.invertDifference) ? target - measure : measure - target;

                // Format the tooltips based on the settings
                if (this.settings.tooltipFormat.show) {
                    if (this.settings.tooltipFormat.measure !== "") measure = d3.format(this.settings.tooltipFormat.measure)(measure);
                    if (this.settings.tooltipFormat.target !== "") target = d3.format(this.settings.tooltipFormat.target)(target);
                    if (this.settings.tooltipFormat.difference !== "") difference = d3.format(this.settings.tooltipFormat.difference)(difference);
                    if (this.settings.bucketIsDate.show) {
                        if (this.settings.tooltipFormat.bucket === "") {
                            bucket = d3.timeFormat("%A %d/%m/%y")(<Date> bucket);
                        } else {
                            bucket = d3.timeFormat(this.settings.tooltipFormat.bucket)(<Date> bucket);
                        }
                    } else {
                        if (this.settings.tooltipFormat.bucket !== "")
                            bucket = d3.format(this.settings.tooltipFormat.bucket)(<number> bucket);
                    }
                }

                return [
                    {
                        displayName: "Measure",
                        value: measure.toString()
                    },
                    {
                        displayName: "Target",
                        value: target.toString()
                    },
                    {
                        displayName: "Difference",
                        value: difference.toString()
                    },
                    {
                        displayName: "Bucket",
                        value: bucket.toString()
                    }
                ];
            },
            (tooltipEvent: DataPoint) => { return tooltipEvent.selectionId; })
    }

    /**
     * Refreshes data store
     * @param options 
     */
    private fetchData(options: VisualUpdateOptions) {
        // Get the data
        let dataSource: powerbi.DataViewCategorical = options.dataViews[0].categorical;

        // Look for the indexes where the value and target reside
        // NOTE: If ever new fields are added, this must be changed
        let measureIndex = 0;
        let targetIndex = 1;
        if (!dataSource.values[0].source.roles["measure"]) {
            measureIndex = 1;
            targetIndex = 0;
        }

        // Map the data and generate selectionIds
        let temp = dataSource.categories[0].values.map((e, i) => {
            let bucket = (this.settings.bucketIsDate.show) ? Date.parse(<string> e) : e;
            let measure = <number> dataSource.values[measureIndex].values[i];
            let target = <number> dataSource.values[targetIndex].values[i];
            let selectionId = this.host.createSelectionIdBuilder()
                    .withCategory(dataSource.categories[0], i)
                    .createSelectionId();
            return {
                bucket: bucket,
                measure: measure,
                target: target,
                selectionId: selectionId
            }
        });

        this.dataMeasureMax = <number> dataSource.values[measureIndex].maxLocal;
        this.dataMeasureMin = <number> dataSource.values[measureIndex].minLocal;
        this.dataTargetMax = <number> dataSource.values[targetIndex].maxLocal;
        this.dataTargetMin = <number> dataSource.values[targetIndex].minLocal;

        // Sort
        this.data = temp.sort((a, b) => { return a.bucket > b.bucket ? 1 : -1 });
    }

    /**
     *  Resize the container and generate the axes
     *  @param options
     */
    private resize(options: VisualUpdateOptions) {
        let width: number = options.viewport.width;
        let height: number = options.viewport.height;
        this.containerWidth = width - this.settings.margins.left - this.settings.margins.right;
        this.containerHeight = height - this.settings.margins.top - this.settings.margins.bottom;

        // Resize the svg and container
        this.svg.attr("width", width);
        this.svg.attr("height", height);
        this.container.attr("transform", "translate(" + this.settings.margins.left + "," + this.settings.margins.top + ")");
    }

    /**
     * Regenerate the axes
     */
    private regenerateAxes() {
        // Regenerate the axes
        this.container.selectAll(".axis").remove();

        // X axis
        this.x = d3.scaleBand()
            .range([0, this.containerWidth])
            .domain(this.data.map(d => String(d.bucket)))
            .padding(0.2);
        let xAxis = d3.axisBottom(this.x);
        if (this.settings.tickFormat.show) {
            // Different formatters for numbers and dates
            if (this.settings.bucketIsDate.show) {
                if (this.settings.tickFormat.x === "")
                    xAxis.tickFormat(d3.timeFormat("%d/%m"));
                else
                    xAxis.tickFormat(d3.timeFormat(this.settings.tickFormat.x));
            } else {
                if (this.settings.tickFormat.x !== "")
                    xAxis.tickFormat(d3.format(this.settings.tickFormat.x));
            }
        }

        // Y axis
        // Lazy way of handing negative values - just try both *0.9 and *1.1 and hit them with the math functions
        debugger;
        let upper = this.settings.axisScaling.show ? this.settings.axisScaling.upper : Math.max(this.dataMeasureMax * 0.8, this.dataMeasureMax * 1.2, this.dataTargetMax * 0.8, this.dataTargetMax * 1.2);
        let lower = this.settings.axisScaling.show ? this.settings.axisScaling.lower : Math.min(this.dataMeasureMin * 0.8, this.dataMeasureMin * 1.2, this.dataTargetMin * 0.8, this.dataTargetMin * 1.2);

        this.y = d3.scaleLinear()
            .range([0, this.containerHeight])
            .domain([upper, lower]);
        let yAxis = this.settings.tickFormat.show && this.settings.tickFormat.y !== ""
            ? d3.axisLeft(this.y).tickFormat(d3.format(this.settings.tickFormat.y))
            : d3.axisLeft(this.y);

        // X axis
        this.container.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + this.containerHeight + ")")
            .call(xAxis)
            .selectAll("text")
                .attr("transform", "translate(-10,0)rotate(-45)")
                .style("text-anchor", "end");

        // Y axis
        this.container.append("g")
            .call(yAxis)
            .attr("class", "axis");
    }

    /**
     * Update settings
     */
    private updateSettings(options: VisualUpdateOptions) {
        this.settings = Settings.parse<Settings>(options.dataViews[0]);
    }

    /**
     * Redraw the bars
     * @param options 
     */
    private redraw(options: VisualUpdateOptions) {
        let bars = this.container.selectAll(".bar");
        // Scale transition time based on the count so the total animation time is constant
        let count = bars.size();

        let currentlySelected = this.selectionManager.getSelectionIds();

        let barTransition = bars.transition()
            .duration(3000/count)
            .delay((d, i) => { return (i*1000/count) });

        // Dont change colours if the only change is a resize
        if (options === null || options.type !== VisualUpdateType.Resize) {
            // Highlight only bars that are selected or all of them if none is selected

            // Powerbi is selecting items not on the page for some reason
            // Iterate through and check that there is at least one of our bars in the selection
            let highlightIndex: number[] = [];
            bars.each((d, i) => { if (currentlySelected.some((e) => { return ((<any> e).key === (<any>(<DataPoint> d).selectionId).key )})) highlightIndex.push(i); })

            // XOR above/below target classification with invert colour setting
            barTransition
                .attr("fill", (d) => { return ((<DataPoint> d).measure >= (<DataPoint> d).target) !== this.settings.invertColours.show ? this.colour.positive : this.colour.negative; })
                .attr("fill-opacity", (d, i) => { return (highlightIndex.length == 0 || highlightIndex.includes(i)) ? 1 : 0.4; });
        }

        if (options !== null) {
            // Handle bar size changes/movements
            barTransition.attr("x", (d) => { return this.x(String((<DataPoint> d).bucket)); })
                .attr("width", this.x.bandwidth())
                // y represents the starting point for the bar while height represents how long the bar is (positive only)
                // As usual for d3, the starting point is from the top and the bar grows downwards
                .attr("y", (d) => {
                    let dataPoint: DataPoint = <DataPoint> d;
                    if (dataPoint.measure === null || dataPoint.target === null || dataPoint.measure <= dataPoint.target)
                        return this.y(dataPoint.target);
                    else
                        return this.y((<DataPoint> d).measure);
                })
                .attr("height", (d) => {
                    let dataPoint: DataPoint = <DataPoint> d;
                    if (dataPoint.measure === null || dataPoint.target === null)
                        return 0;
                    else
                        return Math.abs(this.y(dataPoint.target) - this.y(dataPoint.measure));
                });

            // Handle label rendering
            if (this.settings.labels.show) {
                this.container.selectAll(".label").style("display", null);
                let textTransition = this.container.selectAll(".label").transition()
                    .duration(3000/count)
                    .delay((d, i) => { return (i*1000/count) });

                if (this.settings.labels.dynamicScale) {
                    textTransition.style("textLength", (d) => { return this.x.bandwidth() });
                    textTransition.style("font-size", null);
                } else {
                    textTransition.style("textLength", null);
                    textTransition.style("font-size", (d) => { return this.x.bandwidth()/3 * this.settings.labels.manualScale + "px"; })
                }

                textTransition.attr("x", (d) => { return this.x(String((<DataPoint> d).bucket)) + this.x.bandwidth()/2; })
                    .attr("y", (d) => { return this.y((<DataPoint> d).measure); })
                    .text((d) => { return d3.format(this.settings.labels.format)((<DataPoint> d).measure); })
                    .style("dominant-baseline", (d) => { return (<DataPoint> d).measure > (<DataPoint> d).target ? "auto" : "hanging"; })
                    .style("display", null);
            } else {
                this.container.selectAll(".label").style("display", "none");
            }
        }
    }
}

interface DataPoint {
    bucket: any,
    measure: number,
    target: number,
    selectionId: ISelectionId
}
