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
  <window
    id="conn-status"
    flash-class="home-window-display"
    :display="display"
    @display="$emit('display', $event)"
  >
    <h1 class="window-title">Connection status</h1>

    <div id="conn-status-info">
      {{ status.description }}
    </div>

    <div id="conn-status-delay" class="conn-status-chart">
      <div class="counters">
        <div class="counter">
          <div class="name">Delay</div>
          <div
            class="value"
            v-html="$options.filters.mSecondString(status.delay)"
          ></div>
        </div>
      </div>

      <div class="chart">
        <chart
          id="conn-status-delay-chart"
          :width="480"
          :height="50"
          type="Bar"
          :enabled="display"
          :values="status.delayHistory"
        >
          <defs>
            <linearGradient
              id="conn-status-delay-chart-background"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="100%"
            >
              <stop stop-color="var(--color-start)" offset="0%" />
              <stop stop-color="var(--color-stop)" offset="100%" />
            </linearGradient>
          </defs>
        </chart>
      </div>
    </div>

    <div id="conn-status-traffic" class="conn-status-chart">
      <div class="counters">
        <div class="counter">
          <div class="name">Inbound</div>
          <div
            class="value"
            v-html="$options.filters.bytePerSecondString(status.inbound)"
          ></div>
        </div>

        <div class="counter">
          <div class="name">Outbound</div>
          <div
            class="value"
            v-html="$options.filters.bytePerSecondString(status.outbound)"
          ></div>
        </div>
      </div>

      <div class="chart">
        <chart
          id="conn-status-traffic-chart-in"
          :width="480"
          :height="25"
          type="Bar"
          :max="inoutBoundMax"
          :enabled="display"
          :values="status.inboundHistory"
          @max="inboundMaxColUpdated"
        >
          <defs>
            <linearGradient
              id="conn-status-traffic-chart-in-background"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="100%"
            >
              <stop stop-color="var(--color-start)" offset="0%" />
              <stop stop-color="var(--color-stop)" offset="100%" />
            </linearGradient>
          </defs>
        </chart>
      </div>

      <div class="chart">
        <chart
          id="conn-status-traffic-chart-out"
          :width="480"
          :height="25"
          type="UpsideDownBar"
          :max="inoutBoundMax"
          :enabled="display"
          :values="status.outboundHistory"
          @max="outboundMaxColUpdated"
        >
          <defs>
            <linearGradient
              id="conn-status-traffic-chart-out-background"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="100%"
            >
              <stop stop-color="var(--color-start)" offset="0%" />
              <stop stop-color="var(--color-stop)" offset="100%" />
            </linearGradient>
          </defs>
        </chart>
      </div>
    </div>
  </window>
</template>

<script>
/* eslint vue/attribute-hyphenation: 0 */

import "./status.css";

import Window from "./window.vue";
import Chart from "./chart.vue";

/**
 * @fileoverview Connection status overlay widget. Displays latency and
 * inbound/outbound traffic as real-time bar charts. The two traffic charts
 * share a common y-axis scale so in/out bars are visually comparable — the
 * `inoutBoundMax` computed via `inboundMaxColUpdated` and `outboundMaxColUpdated`
 * is fed back to both charts as the `max` prop.
 *
 * @prop {boolean} display - Controls overlay visibility.
 * @prop {Object}  status  - Live connection metrics object with fields:
 *   `description`, `delay`, `delayHistory`, `inbound`, `inboundHistory`,
 *   `outbound`, `outboundHistory`.
 *
 * @emits display - Forwarded from the window widget; payload: `{boolean}`.
 */

export default {
  components: {
    window: Window,
    chart: Chart,
  },
  filters: {
    /**
     * Formats a bytes-per-second value as a human-readable string with an
     * appropriate binary unit (byte/s through tib/s), wrapped in an HTML
     * `<span>` for the unit suffix.
     *
     * @param {number} n - Raw value in bytes per second.
     * @returns {string} HTML string, e.g. `"1.23 <span>kib/s</span>"`.
     */
    bytePerSecondString(n) {
      const bNames = ["byte/s", "kib/s", "mib/s", "gib/s", "tib/s"];
      let remain = n,
        nUnit = bNames[0];

      for (let i in bNames) {
        nUnit = bNames[i];

        if (remain < 1024) {
          break;
        }

        remain /= 1024;
      }

      return (
        Number(remain.toFixed(2)).toLocaleString() +
        " <span>" +
        nUnit +
        "</span>"
      );
    },
    /**
     * Formats a millisecond value as a human-readable string with an appropriate
     * time unit (ms, s, or m), wrapped in an HTML `<span>` for the unit suffix.
     * Returns `"??"` for negative values (i.e. unmeasured delay).
     *
     * @param {number} n - Latency value in milliseconds.
     * @returns {string} HTML string, e.g. `"42.00 <span>ms</span>"`, or `"??"`.
     */
    mSecondString(n) {
      if (n < 0) {
        return "??";
      }

      const bNames = ["ms", "s", "m"];
      let remain = n,
        nUnit = bNames[0];

      for (let i in bNames) {
        nUnit = bNames[i];

        if (remain < 1000) {
          break;
        }

        remain /= 1000;
      }

      return (
        Number(remain.toFixed(2)).toLocaleString() +
        " <span>" +
        nUnit +
        "</span>"
      );
    },
  },
  props: {
    display: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Object,
      default: () => {
        return {
          description: "",
          delay: 0,
          delayHistory: [],
          inbound: 0,
          inboundHistory: [],
          outbound: 0,
          outboundHistory: [],
        };
      },
    },
  },
  /**
   * @returns {{inoutBoundMax: number, inboundMax: number, outboundMax: number}}
   *   `inboundMax` and `outboundMax` track the latest data maxima from each traffic chart.
   *   `inoutBoundMax` is the larger of the two and is fed back to both charts as `max`
   *   so they share a common y-axis scale.
   */
  data() {
    return {
      inoutBoundMax: 0,
      inboundMax: 0,
      outboundMax: 0,
    };
  },
  methods: {
    /**
     * Updates the tracked inbound maximum and recomputes the shared y-axis maximum.
     * Called when the inbound traffic chart emits a `max` event.
     *
     * @param {number} d - The new inbound data maximum observed by the chart.
     * @returns {void}
     */
    inboundMaxColUpdated(d) {
      this.inboundMax = d;

      this.inoutBoundMax =
        this.inboundMax > this.outboundMax ? this.inboundMax : this.outboundMax;
    },
    /**
     * Updates the tracked outbound maximum and recomputes the shared y-axis maximum.
     * Called when the outbound traffic chart emits a `max` event.
     *
     * @param {number} d - The new outbound data maximum observed by the chart.
     * @returns {void}
     */
    outboundMaxColUpdated(d) {
      this.outboundMax = d;

      this.inoutBoundMax =
        this.inboundMax > this.outboundMax ? this.inboundMax : this.outboundMax;
    },
  },
};
</script>
