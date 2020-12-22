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
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import * as d3 from "d3";
import { CountableTimeInterval, keys } from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

export class Visual implements IVisual {
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private svg: Selection<SVGElement>;
    private container: Selection<SVGElement>;
    private margin = { top:10, right:30, bottom:90, left:40 };
    private colour = { positive: "green", negative: "red" };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.svg = d3.select(options.element)
            .append("svg");
        this.container = this.svg.append("g");
    }

    public update(options: VisualUpdateOptions) {
        // Remove the axes
        this.container.selectAll(".axis").remove();

        // Set the height of the whole chart
        let width: number = options.viewport.width;
        let height: number = options.viewport.height;
        this.svg.attr("width", width);
        this.svg.attr("height", height);

        // Now set up the size of the container
        width = width - this.margin.left - this.margin.right;
        height = height - this.margin.top - this.margin.bottom;
        this.container.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        // Get the data
        let dataSource: powerbi.DataViewCategorical = options.dataViews[0].categorical;

        // Look for the indexes where the value and line reside
        let measureIndex = 0;
        let lineIndex = 1;
        if (!dataSource.values[0].source.roles["measure"]) {
            measureIndex = 1;
            lineIndex = 0;
        }

        // Map the data and generate selectionIds
        let data: DataPoint[] = dataSource.categories[0].values.map((e, i) => {
            return {
                "bucket": e,
                "measure": <number> dataSource.values[measureIndex].values[i],
                "line": <number> dataSource.values[lineIndex].values[i],
                "selectionId": this.host.createSelectionIdBuilder()
                    .withCategory(dataSource.categories[0], i)
                    .createSelectionId()
            }
        });

        // X axis scaler
        let x = d3.scaleBand()
            .range([0, width])
            .domain(data.map(x => String(x.bucket)))
            .padding(0.2);
        // X axis
        this.container.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x))
            .selectAll("text")
                .attr("transform", "translate(-10,0)rotate(-45)")
                .style("text-anchor", "end");

        // Y axis scaler
        let y = d3.scaleLinear()
            .range([height, 0])
            .domain([0, 2]);
        // Y axis
        this.container.append("g")
            .call(d3.axisLeft(y))
            .attr("class", "axis");

        // Bars
        // Binds data
        let bars = this.container.selectAll("rect")
            .data(data);
        // Generate new entries when required
        bars.enter()
            .append("rect")
                .attr("x", d => { return x(String(d.bucket)) })
                .attr("width", x.bandwidth())
                // Zero out height to being with
                .attr("y", d => { return y(0) })
                .attr("height", d => { return height - y(0) });
        // Remove entries when no longer needed
        bars.exit()
            .remove();

        // Animate changes in the bars
        // This also handles data refreshing
        this.container.selectAll("rect")
            // .transition()
            // .duration(100)
            // .delay((d, i) => { return (i*100) })
            .attr("fill", d => { return (<DataPoint> d).measure >= (<DataPoint> d).line ? this.colour.positive : this.colour.negative })
            .attr("x", d => { return x(String((<DataPoint> d).bucket)) })
            .attr("width", x.bandwidth())
            .attr("y", d => { return (<DataPoint> d).measure > (<DataPoint> d).line ? y((<DataPoint> d).measure) : y((<DataPoint> d).line) })
            .attr("height",d => { return height - y(Math.abs((<DataPoint> d).line - (<DataPoint> d).measure)) });
    }
}

interface DataPoint {
    bucket: any,
    measure: number,
    line: number,
    selectionId: ISelectionId
}
