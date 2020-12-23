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

import { dataRoleHelper } from "powerbi-visuals-utils-dataviewutils";

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

    private selectedBarId: ISelectionId;
    private data: DataPoint[];

    private settings = { toggle: false };

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
        let objectName: string = options.objectName;
        let objectEnumeration: VisualObjectInstance[] = [];

        switch(objectName) {
            case "Chart Settings":
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        toggle: this.settings.toggle
                    },
                    selector: null
                });
                break;
        };
    
        return objectEnumeration;
    }

    /**
     * Called by PowerBi whenever the chart is updated
     * @param options 
     */
    public update(options: VisualUpdateOptions) {
        // Refetch data
        this.fetchData(options);

        // Reisze the container and regenerate the axes
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
                    // Clear or select the bar
                    if (this.selectedBarId == d.selectionId) {
                        this.selectionManager.clear();
                        this.selectedBarId = null;
                    } else {
                        this.selectionManager.select(d.selectionId);
                        this.selectedBarId = d.selectionId;
                    }                    
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
        this.data = dataSource.categories[0].values.map((e, i) => {
            return {
                "bucket": e,
                "measure": <number> dataSource.values[measureIndex].values[i],
                "line": <number> dataSource.values[lineIndex].values[i],
                "selectionId": this.host.createSelectionIdBuilder()
                    .withCategory(dataSource.categories[0], i)
                    .createSelectionId()
            }
        });
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

        // X axis scaler
        this.x = d3.scaleBand()
            .range([0, this.containerWidth])
            .domain(this.data.map(d => String(d.bucket)))
            .padding(0.2);
        // X axis
        this.container.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + this.containerHeight + ")")
            .call(d3.axisBottom(this.x))
            .selectAll("text")
                .attr("transform", "translate(-10,0)rotate(-45)")
                .style("text-anchor", "end");

        // Y axis scaler
        this.y = d3.scaleLinear()
            .range([this.containerHeight, 0])
            .domain([0, 2]);
        // Y axis
        this.container.append("g")
            .call(d3.axisLeft(this.y))
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

        bars.transition()
            .duration(3000/count)
            .delay((d, i) => { return (i*1000/count) })
            .attr("fill", d => { return (<DataPoint> d).measure >= (<DataPoint> d).line ? this.colour.positive : this.colour.negative })
            .attr("fill-opacity", d => { return (<DataPoint> d).selectionId === this.selectedBarId || this.selectedBarId == null ? 1 : 0.4 })
            .attr("x", d => { return this.x(String((<DataPoint> d).bucket)) })
            .attr("width", this.x.bandwidth())
            .attr("y", d => { return (<DataPoint> d).measure > (<DataPoint> d).line ? this.y((<DataPoint> d).measure) : this.y((<DataPoint> d).line) })
            .attr("height", d => { return this.containerHeight - this.y(Math.abs((<DataPoint> d).line - (<DataPoint> d).measure)) });
    }
}

interface DataPoint {
    bucket: any,
    measure: number,
    line: number,
    selectionId: ISelectionId
}
