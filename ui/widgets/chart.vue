<!--
// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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

const XMLNG = "http://www.w3.org/2000/svg";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const XMLNGLink = "http://www.w3.org/1999/xlink";

class Data {
  constructor(data) {
    this.data = data;
    this.max = this.getMax(data);
  }

  setMax(max) {
    this.max = this.max > max ? this.max : max;
  }

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

class BaseDrawer {
  constructor() {
    this.elements = [];
  }

  toCellHeight(cellHeight, data, n) {
    if (data.max === 0) {
      return 0;
    }

    return (cellHeight / data.max) * n;
  }

  toBottomHeight(cellHeight, n) {
    return cellHeight - n;
  }

  cellWidth(rootDim, data) {
    return rootDim.width / data.data.length;
  }

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

  removeAllEl(parent) {
    for (let i in this.elements) {
      parent.removeChild(this.elements[i]);
    }

    this.elements = [];
  }

  draw(parent, rootDim, data) {}
}

class BarDrawer extends BaseDrawer {
  constructor(topBottomPadding) {
    super();

    this.topBottomPadding = topBottomPadding;
  }

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
        class: h === 0 ? "zero" : data.data[i].class
      });

      currentWidth += cellWidth;
    }
  }
}

class UpsideDownBarDrawer extends BarDrawer {
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
        class: h === 0 ? "zero" : data.data[i].class
      });

      currentWidth += cellWidth;
    }
  }
}

class Chart {
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
        parseInt(this.dim.height, 10)
    );

    this.el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  getGroupRoot() {
    if (this.group) {
      return this.group;
    }

    this.group = document.createElementNS(XMLNG, "g");

    this.el.appendChild(this.group);

    return this.group;
  }

  draw(data, manualMax) {
    let d = new Data(data);
    let max = d.max;

    d.setMax(manualMax);

    this.drawer.removeAllEl(this.getGroupRoot());
    this.drawer.draw(this.getGroupRoot(), this.dim, d);

    return {
      dataMax: max,
      resultMax: d.max
    };
  }

  clear() {
    this.drawer.removeAllEl();
    this.el.removeChild(this.getGroupRoot());
  }
}

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
  props: {
    values: {
      type: Array,
      default: () => []
    },
    width: {
      type: Number,
      default: 0
    },
    height: {
      type: Number,
      default: 0
    },
    max: {
      type: Number,
      default: 0
    },
    enabled: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      default: ""
    }
  },
  data() {
    return {
      chart: null,
      previousMax: 0
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
    }
  },
  mounted() {
    this.chart = new Chart(
      this.$el,
      this.width,
      this.height,
      buildDrawer(this.type)
    );
  },
  beforeDestroy() {
    this.chart.clear();
  },
  methods: {
    draw() {
      let r = this.chart.draw(this.values, this.max);

      if (r.dataMax === this.previousMax) {
        return;
      }

      this.$emit("max", r.dataMax);
      this.previousMax = r.dataMax;
    }
  }
};
</script>
