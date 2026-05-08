<!--
// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2026 Ni Rui <ranqus@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<template>
  <svg xmlns="http://www.w3.org/2000/svg">
    <slot />
  </svg>
</template>

<script>
/* eslint vue/attribute-hyphenation: 0 */

/**
 * @fileoverview SVG bar-chart widget used to visualise time-series metrics
 * (delay, inbound/outbound traffic) in the connection status panel.
 *
 * Renders an `<svg>` root via a slot and redraws on every `values` or `max`
 * change when `enabled` is true. Emits a `max` event whenever the observed
 * data maximum changes, allowing sibling charts to share a common y-axis scale.
 *
 * @prop {Array}   values  - Array of `{data: number, class: string}` data points.
 * @prop {number}  width   - ViewBox width in SVG user units.
 * @prop {number}  height  - ViewBox height in SVG user units.
 * @prop {number}  max     - External y-axis maximum override (0 = auto).
 * @prop {boolean} enabled - When false, draw calls are skipped entirely.
 * @prop {string}  type    - Drawer variant: `"Bar"` or `"UpsideDownBar"`.
 *
 * @emits max - Emitted with the observed data maximum whenever it changes
 *   after a draw. Payload: `{number}` the new maximum value.
 */

const XMLNG = "http://www.w3.org/2000/svg";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const XMLNGLink = "http://www.w3.org/1999/xlink";

/**
 * Wraps an array of data points and tracks the observed maximum value.
 *
 * @private
 */
class Data {
  /**
   * @param {Array<{data: number, class: string}>} data - Raw data-point array.
   */
  constructor(data) {
    this.data = data;
    this.max = this.getMax(data);
  }

  /**
   * Raises the tracked maximum to at least `max` if it is currently lower.
   *
   * @param {number} max - External lower-bound for the maximum.
   * @returns {void}
   */
  setMax(max) {
    this.max = this.max > max ? this.max : max;
  }

  /**
   * Scans the data array and returns the highest `data` value found.
   *
   * @param {Array<{data: number}>} data - Data-point array to scan.
   * @returns {number} The maximum data value, or 0 if the array is empty.
   */
  getMax(data) {
    let max = 0;

    for (let i in data) {
      if (data[i].data <= max) {
        continue;
      }

      max = data[i].data;
    }

    return max;
  }
}

/**
 * Abstract base class for SVG chart drawers.
 *
 * Maintains a list of created SVG elements so they can be removed atomically
 * before each redraw. Subclasses override `draw()` to produce their layout.
 *
 * @private
 * @abstract
 */
class BaseDrawer {
  constructor() {
    /** @type {SVGElement[]} Elements created during the last draw call. */
    this.elements = [];
  }

  /**
   * Converts a data value to a pixel height proportional to the data maximum.
   *
   * @param {number} cellHeight - Available height in SVG user units.
   * @param {Data} data - Data wrapper holding the current maximum.
   * @param {number} n - The raw data value to scale.
   * @returns {number} Scaled height in SVG user units, or 0 if max is 0.
   */
  toCellHeight(cellHeight, data, n) {
    if (data.max === 0) {
      return 0;
    }

    return (cellHeight / data.max) * n;
  }

  /**
   * Converts a scaled bar height to its top y-coordinate, measured from the
   * bottom of the cell.
   *
   * @param {number} cellHeight - Total cell height in SVG user units.
   * @param {number} n - Scaled bar height.
   * @returns {number} The y-coordinate of the top of the bar.
   */
  toBottomHeight(cellHeight, n) {
    return cellHeight - n;
  }

  /**
   * Computes the equal width allocated to each data column.
   *
   * @param {{width: number, height: number}} rootDim - SVG viewBox dimensions.
   * @param {Data} data - Data wrapper providing the column count.
   * @returns {number} Width of a single column in SVG user units.
   */
  cellWidth(rootDim, data) {
    return rootDim.width / data.data.length;
  }

  /**
   * Creates a namespaced SVG element, sets its attributes, appends it to
   * `parent`, and registers it for later removal.
   *
   * Attribute names starting with `"xlink:"` use the XLink namespace;
   * those starting with `"xmlns:"` use the XML Namespaces namespace.
   *
   * @param {SVGElement} parent - The SVG element to append to.
   * @param {string} tag - Local SVG tag name (e.g. `"path"`, `"rect"`).
   * @param {Object.<string, string>} properties - Map of attribute name to value.
   * @returns {SVGElement} The newly created element.
   */
  createEl(parent, tag, properties) {
    let np = document.createElementNS(XMLNG, tag);

    for (let p in properties) {
      if (p.indexOf("xlink:") === 0) {
        np.setAttributeNS(XMLNGLink, p, properties[p]);
      } else if (p.indexOf("xmlns:") === 0) {
        np.setAttributeNS(XMLNS, p, properties[p]);
      } else {
        np.setAttribute(p, properties[p]);
      }
    }

    parent.appendChild(np);

    this.elements.push(np);

    return np;
  }

  /**
   * Removes all elements created during the previous draw from the DOM and
   * clears the internal tracking array.
   *
   * @param {SVGElement} parent - The SVG group element to remove children from.
   * @returns {void}
   */
  removeAllEl(parent) {
    for (let i in this.elements) {
      parent.removeChild(this.elements[i]);
    }

    this.elements = [];
  }

  /**
   * Draws the chart into `parent`. Subclasses must override this method.
   *
   * @param {SVGElement} _parent - Target SVG group element.
   * @param {{width: number, height: number}} _rootDim - Available dimensions.
   * @param {Data} _data - Data wrapper to visualise.
   * @returns {void}
   */
  draw(_parent, _rootDim, _data) {}
}

/**
 * Draws upward-growing vertical bar lines from the bottom of the SVG.
 *
 * @private
 * @extends BaseDrawer
 */
class BarDrawer extends BaseDrawer {
  /**
   * @param {number} topBottomPadding - Total vertical padding (split evenly
   *   between top and bottom) reserved so bars do not touch the SVG edges.
   */
  constructor(topBottomPadding) {
    super();

    this.topBottomPadding = topBottomPadding;
  }

  /**
   * Renders one `<path>` SVG element per data point as a vertical line
   * growing upward from the padded bottom baseline.
   *
   * @param {SVGElement} parent - Target `<g>` group element.
   * @param {{width: number, height: number}} rootDim - SVG viewBox dimensions.
   * @param {Data} data - Data wrapper to visualise.
   * @returns {void}
   */
  draw(parent, rootDim, data) {
    let cellWidth = this.cellWidth(rootDim, data),
      currentWidth = cellWidth / 2,
      cellHalfHeight = rootDim.height - this.topBottomPadding / 2,
      cellHeight = rootDim.height - this.topBottomPadding;

    for (let i in data.data) {
      let h = this.toCellHeight(cellHeight, data, data.data[i].data);

      this.createEl(parent, "path", {
        d:
          "M" +
          currentWidth +
          "," +
          Math.round(this.toBottomHeight(cellHalfHeight, h)) +
          " L" +
          currentWidth +
          "," +
          cellHalfHeight,
        class: h === 0 ? "zero" : data.data[i].class,
      });

      currentWidth += cellWidth;
    }
  }
}

/**
 * Draws downward-growing vertical bar lines from the top of the SVG.
 *
 * Used for the outbound-traffic chart so it mirrors the inbound chart above it,
 * creating a symmetric in/out traffic visualisation.
 *
 * @private
 * @extends BarDrawer
 */
class UpsideDownBarDrawer extends BarDrawer {
  /**
   * Renders one `<path>` SVG element per data point as a vertical line
   * growing downward from the padded top edge.
   *
   * @param {SVGElement} parent - Target `<g>` group element.
   * @param {{width: number, height: number}} rootDim - SVG viewBox dimensions.
   * @param {Data} data - Data wrapper to visualise.
   * @returns {void}
   */
  draw(parent, rootDim, data) {
    let cellWidth = this.cellWidth(rootDim, data),
      currentWidth = cellWidth / 2,
      padHalfHeight = this.topBottomPadding / 2,
      cellHeight = rootDim.height - this.topBottomPadding;

    for (let i in data.data) {
      let h = this.toCellHeight(cellHeight, data, data.data[i].data);

      this.createEl(parent, "path", {
        d:
          "M" +
          currentWidth +
          "," +
          padHalfHeight +
          " L" +
          currentWidth +
          "," +
          (Math.round(h) + padHalfHeight),
        class: h === 0 ? "zero" : data.data[i].class,
      });

      currentWidth += cellWidth;
    }
  }
}

/**
 * High-level chart controller that owns an SVG root element and delegates
 * drawing to a `BaseDrawer` subclass.
 *
 * @private
 */
class Chart {
  /**
   * @param {SVGSVGElement} el - The root `<svg>` DOM element to draw into.
   * @param {number} width - ViewBox width in SVG user units.
   * @param {number} height - ViewBox height in SVG user units.
   * @param {BaseDrawer} drawer - The drawer strategy to use for rendering.
   */
  constructor(el, width, height, drawer) {
    this.el = el;
    this.drawer = drawer;
    this.group = null;
    this.paths = [];
    this.dim = { width, height };

    this.el.setAttribute(
      "viewBox",
      "0 0 " +
        parseInt(this.dim.width, 10) +
        " " +
        parseInt(this.dim.height, 10),
    );

    this.el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  /**
   * Lazily creates and returns the `<g>` group element that drawers render into.
   *
   * @returns {SVGGElement} The chart's root group element.
   */
  getGroupRoot() {
    if (this.group) {
      return this.group;
    }

    this.group = document.createElementNS(XMLNG, "g");

    this.el.appendChild(this.group);

    return this.group;
  }

  /**
   * Redraws the chart with new data, applying an optional external maximum.
   *
   * Removes all previously drawn elements, wraps `data` in a `Data` instance,
   * applies `manualMax` as a lower-bound on the y-axis scale, then delegates to
   * the drawer.
   *
   * @param {Array<{data: number, class: string}>} data - Data points to render.
   * @param {number} manualMax - External y-axis minimum maximum (0 = no override).
   * @returns {{dataMax: number, resultMax: number}} `dataMax` is the highest
   *   value observed in `data`; `resultMax` is the scale maximum actually used
   *   (may be higher due to `manualMax`).
   */
  draw(data, manualMax) {
    let d = new Data(data);
    let max = d.max;

    d.setMax(manualMax);

    this.drawer.removeAllEl(this.getGroupRoot());
    this.drawer.draw(this.getGroupRoot(), this.dim, d);

    return {
      dataMax: max,
      resultMax: d.max,
    };
  }

  /**
   * Removes all drawn elements and detaches the group from the SVG root.
   *
   * @returns {void}
   */
  clear() {
    this.drawer.removeAllEl();
    this.el.removeChild(this.getGroupRoot());
  }
}

/**
 * Factory that maps a drawer-type string to a `BaseDrawer` instance.
 *
 * @private
 * @param {string} type - Drawer variant identifier. Supported values:
 *   `"Bar"` and `"UpsideDownBar"`.
 * @returns {BaseDrawer|Error} The matching drawer, or an `Error` for unknown types.
 */
function buildDrawer(type) {
  switch (type) {
    case "Bar":
      return new BarDrawer(10);

    case "UpsideDownBar":
      return new UpsideDownBarDrawer(10);
  }

  return new Error("Undefined drawer: " + type);
}

export default {
  /**
   * @typedef {Object} ChartProps
   * @property {Array<{data: number, class: string}>} values - Data points to plot.
   * @property {number} width - ViewBox width in SVG user units.
   * @property {number} height - ViewBox height in SVG user units.
   * @property {number} max - External y-axis minimum maximum; 0 means auto.
   * @property {boolean} enabled - When false, draw calls are skipped.
   * @property {string} type - Drawer variant: `"Bar"` or `"UpsideDownBar"`.
   */
  props: {
    values: {
      type: Array,
      default: () => [],
    },
    width: {
      type: Number,
      default: 0,
    },
    height: {
      type: Number,
      default: 0,
    },
    max: {
      type: Number,
      default: 0,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      default: "",
    },
  },
  /**
   * @returns {{chart: Chart|null, previousMax: number}}
   *   `chart` — the active Chart controller (initialised in `mounted`).
   *   `previousMax` — last emitted data maximum, used to suppress redundant events.
   */
  data() {
    return {
      chart: null,
      previousMax: 0,
    };
  },
  watch: {
    values() {
      if (!this.enabled) {
        return;
      }

      this.draw();
    },
    max() {
      if (!this.enabled) {
        return;
      }

      this.draw();
    },
    enabled(newVal) {
      if (!newVal) {
        return;
      }

      this.draw();
    },
  },
  mounted() {
    this.chart = new Chart(
      this.$el,
      this.width,
      this.height,
      buildDrawer(this.type),
    );
  },
  beforeDestroy() {
    this.chart.clear();
  },
  methods: {
    /**
     * Redraws the chart and emits a `max` event if the observed data maximum
     * has changed since the last draw.
     *
     * @emits max - Payload: `{number}` the new observed data maximum.
     * @returns {void}
     */
    draw() {
      let r = this.chart.draw(this.values, this.max);

      if (r.dataMax === this.previousMax) {
        return;
      }

      this.$emit("max", r.dataMax);
      this.previousMax = r.dataMax;
    },
  },
};
</script>
