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
import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
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

import { SettingsParser } from "./settings";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

export class Visual implements IVisual {
    // PBI interactions
    private host: IVisualHost;
    private selectionManager: ISelectionManager;

    // HTML element
    private svg: Selection<SVGElement>;
    private container: Selection<SVGElement>;

    // Configuration
    private margin = { top:10, right:30, bottom:90, left:40 };
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
    private dataBucketFormat: string;
    private dataMeasureFormat: string;

    private settingsParser: SettingsParser = new SettingsParser();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.svg = d3.select(options.element)
            .append("svg");
        this.container = this.svg.append("g");
    }

    /**
     * Called by PowerBi to handle chart properties
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        return SettingsParser.enumerateObjectInstances(this.settingsParser, options);
    }

    /**
     * Called by PowerBi whenever the chart is updated
     * @param options 
     */
    public update(options: VisualUpdateOptions) {
        // Refetch data
        this.fetchData(options);

        // Update settings
        this.settingsParser = SettingsParser.parse<SettingsParser>(options.dataViews[0]);

        // Resize the container and regenerate the axes
        this.resize(options);

        // Update the bars
        // Binds data
        let bars = this.container.selectAll("rect")
            .data(this.data);

        // Configure the generation of bars
        bars.enter()
            .append("rect")
                .attr("x", d => { return this.x(String((<DataPoint> d).bucket)) })
                .attr("width", this.x.bandwidth())
                .attr("y", d => { return this.y((<DataPoint> d).line) })
                .attr("height", 0 )
            .on("click", d => {
                // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                if (this.host.allowInteractions) {
                    this.selectionManager.select(d.selectionId);
                    this.redraw(options);
                }
            });
        // Remove entries when no longer needed
        bars.exit()
            .remove();

        this.redraw(options);
    }


    /**
     * Refreshes data store
     * @param options 
     */
    private fetchData(options: VisualUpdateOptions) {
        // Get the data
        let dataSource: powerbi.DataViewCategorical = options.dataViews[0].categorical;

        // Look for the indexes where the value and line reside
        // NOTE: If ever new fields are added, this must be changed
        let measureIndex = 0;
        let lineIndex = 1;
        if (!dataSource.values[0].source.roles["measure"]) {
            measureIndex = 1;
            lineIndex = 0;
        }

        // Map the data and generate selectionIds
        let temp = dataSource.categories[0].values.map((e, i) => {
            return {
                "bucket": e,
                "measure": <number> dataSource.values[measureIndex].values[i],
                "line": <number> dataSource.values[lineIndex].values[i],
                "selectionId": this.host.createSelectionIdBuilder()
                    .withCategory(dataSource.categories[0], i)
                    .createSelectionId()
            }
        });

        this.dataMeasureMax = <number> dataSource.values[measureIndex].maxLocal;
        this.dataMeasureMin = <number> dataSource.values[measureIndex].minLocal;
        this.dataBucketFormat = dataSource.categories[0].source.format;
        this.dataMeasureFormat = dataSource.values[measureIndex].source.format;
        
        // Sort
        this.data = temp.sort((a, b) => { return a.bucket > b.bucket ? 1 : -1 });
    }

    /**
     *  Resize the container and generate the axes
     */
    private resize(options: VisualUpdateOptions) {
        let width: number = options.viewport.width;
        let height: number = options.viewport.height;
        this.containerWidth = width - this.margin.left - this.margin.right;
        this.containerHeight = height - this.margin.top - this.margin.bottom;

        // Resize the svg and container
        this.svg.attr("width", width);
        this.svg.attr("height", height);
        this.container.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        // Regenerate the axes
        this.container.selectAll(".axis").remove();

        let xFormatter = valueFormatter.create({ format: this.dataBucketFormat });
        let yFormatter = valueFormatter.create({ format: this.dataMeasureFormat });

        // X axis scaler
        this.x = d3.scaleBand()
            .range([0, this.containerWidth])
            .domain(this.data.map(d => String(d.bucket)))
            .padding(0.2);
        // X axis
        this.container.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + this.containerHeight + ")")
            .call(d3.axisBottom(this.x).tickFormat((x) => { return xFormatter.format(x) }))
            .selectAll("text")
                .attr("transform", "translate(-10,0)rotate(-45)")
                .style("text-anchor", "end");

        // Y axis scaler
        let upper = this.settingsParser.axisScaling.show ? this.settingsParser.axisScaling.upper : this.dataMeasureMax * 1.2;
        let lower = this.settingsParser.axisScaling.show ? this.settingsParser.axisScaling.lower : this.dataMeasureMin * 0.8;

        this.y = d3.scaleLinear()
            .range([0, this.containerHeight])
            .domain([upper, lower]);
        // Y axis
        this.container.append("g")
            .call(d3.axisLeft(this.y).tickFormat((x) => { return yFormatter.format(x) }))
            .attr("class", "axis");
    }

    /**
     * Redraw the bars
     * @param options 
     */
    private redraw(options: VisualUpdateOptions) {
        let bars = this.container.selectAll("rect");
        // Scale transition time based on the count so the total animation time is constant
        let count = bars.size();

        let currentlySelected = this.selectionManager.getSelectionIds();

        bars.transition()
            .duration(3000/count)
            .delay((d, i) => { return (i*1000/count) })
            .attr("fill", d => { return (<DataPoint> d).measure >= (<DataPoint> d).line ? this.colour.positive : this.colour.negative })
            .attr("fill-opacity", d => { return currentlySelected.indexOf((<DataPoint> d).selectionId) > -1 || currentlySelected.length == 0 ? 1 : 0.4 })
            .attr("x", d => { return this.x(String((<DataPoint> d).bucket)) })
            .attr("width", this.x.bandwidth())
            // y represents the starting point for the bar while height represents how long the bar is (positive only)
            // As usual for d3, the starting point is from the top and the bar grows downwards
            .attr("y", d => { return (<DataPoint> d).measure > (<DataPoint> d).line ? this.y((<DataPoint> d).measure) : this.y((<DataPoint> d).line) })
            .attr("height", d => { return Math.abs(this.y((<DataPoint> d).line) - this.y((<DataPoint> d).measure)); });
    }
}

interface DataPoint {
    bucket: any,
    measure: number,
    line: number,
    selectionId: ISelectionId
}
