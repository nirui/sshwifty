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

/**
 * @file home_socketctl.js
 * @description Factory for the socket status controller object used by the
 * `home` Vue component. The controller tracks live traffic metrics and
 * connection latency, aggregates them into per-second and 10-second history
 * windows, and exposes Vue-reactive properties for the status indicator and
 * sparkline graphs.
 */

import * as history from "./history.js";
import { ECHO_FAILED } from "./socket.js";

/**
 * Builds the reactive socket-status controller for the home view.
 *
 * Returns a plain object whose properties are observed by Vue. The controller
 * accumulates inbound/outbound byte counts, flushes them into {@link history.Records}
 * ring buffers every second and every 10 seconds, and derives the delay
 * indicator class and human-readable description from echo measurements.
 *
 * @param {{ connector: { inputting: boolean } }} ctx - The home component
 *   instance, used to reset `connector.inputting` on close/failure.
 * @returns {{ update: function(Date): void, connecting: function(): void,
 *   connected: function(): void, traffic: function(number, number): void,
 *   echo: function(number): void, close: function(Error|null): void,
 *   failed: function(Error): void, classStyle: string, windowClass: string,
 *   message: string, status: object }} The socket status controller object.
 */
export function build(ctx) {
  const connectionStatusNotConnected = "Sshwifty is ready to connect";
  const connectionStatusConnecting =
    "Connecting to Sshwifty backend server. It should only take " +
    "less than a second, or two";
  const connectionStatusDisconnected =
    "Sshwifty is disconnected from it's backend server";
  const connectionStatusConnected =
    "Sshwifty is connected to it's backend server, user interface operational";
  const connectionStatusUnmeasurable =
    "Unable to measure connection delay. The connection maybe very " +
    "busy or already lost";

  const connectionDelayGood =
    "Connection delay is low, operation should be very responsive";
  const connectionDelayFair =
    "Experiencing minor connection delay, operation should be responded " +
    "within a reasonable time";
  const connectionDelayMedian =
    "Experiencing median connection delay, consider to slow down your input " +
    "to avoid misoperation";
  const connectionDelayHeavy =
    "Experiencing bad connection delay, operation may freeze at any moment. " +
    "Consider to pause your input until remote is responsive";

  /**
   * Creates a 32-element pre-allocated history buffer filled with zero-value
   * sentinel entries for use as a sparkline ring buffer.
   *
   * @private
   * @returns {Array<{ data: number, class: string }>} A 32-entry zeroed buffer.
   */
  const buildEmptyHistory = () => {
    let r = [];

    for (let i = 0; i < 32; i++) {
      r.push({ data: 0, class: "" });
    }

    return r;
  };

  let isClosed = false,
    inboundPerSecond = 0,
    outboundPerSecond = 0,
    trafficPreSecondNextUpdate = new Date(),
    inboundPre10Seconds = 0,
    outboundPre10Seconds = 0,
    trafficPre10sNextUpdate = new Date(),
    inboundHistory = new history.Records(buildEmptyHistory()),
    outboundHistory = new history.Records(buildEmptyHistory()),
    trafficSamples = 0;

  let delayHistory = new history.Records(buildEmptyHistory()),
    delaySamples = 0,
    delayPerInterval = 0;

  return {
    /**
     * Ticks the traffic and delay aggregation windows.
     *
     * Should be called once per second from the home component's `setInterval`
     * ticker. Flushes per-second counters into 10-second accumulators and
     * pushes averaged samples into the history ring buffers at the appropriate
     * cadence.
     *
     * @param {Date} time - Current timestamp used to determine flush boundaries.
     * @returns {void}
     */
    update(time) {
      if (isClosed) {
        return;
      }

      if (time >= trafficPreSecondNextUpdate) {
        trafficPreSecondNextUpdate = new Date(time.getTime() + 1000);
        inboundPre10Seconds += inboundPerSecond;
        outboundPre10Seconds += outboundPerSecond;

        this.status.inbound = inboundPerSecond;
        this.status.outbound = outboundPerSecond;

        inboundPerSecond = 0;
        outboundPerSecond = 0;

        trafficSamples++;
      }

      if (time >= trafficPre10sNextUpdate) {
        trafficPre10sNextUpdate = new Date(time.getTime() + 10000);

        if (trafficSamples > 0) {
          inboundHistory.update(inboundPre10Seconds / trafficSamples);
          outboundHistory.update(outboundPre10Seconds / trafficSamples);

          inboundPre10Seconds = 0;
          outboundPre10Seconds = 0;
          trafficSamples = 0;
        } else {
          inboundHistory.update(0);
          outboundHistory.update(0);
        }

        if (delaySamples > 0) {
          delayHistory.update(delayPerInterval / delaySamples);

          delaySamples = 0;
          delayPerInterval = 0;
        } else {
          delayHistory.update(0);
        }
      }
    },
    classStyle: "",
    windowClass: "",
    message: "",
    status: {
      description: connectionStatusNotConnected,
      delay: 0,
      delayHistory: delayHistory.get(),
      inbound: 0,
      inboundHistory: inboundHistory.get(),
      outbound: 0,
      outboundHistory: outboundHistory.get(),
    },
    /**
     * Transitions the status indicator to the "connecting" state.
     *
     * Sets the indicator class to `"working"` and clears any error styling.
     *
     * @returns {void}
     */
    connecting() {
      isClosed = false;

      this.message = "--";
      this.classStyle = "working";
      this.windowClass = "";
      this.status.description = connectionStatusConnecting;
    },
    /**
     * Transitions the status indicator to the "connected" state.
     *
     * Clears error styling; latency display will be updated by subsequent
     * {@link echo} calls once the first heartbeat round-trip completes.
     *
     * @returns {void}
     */
    connected() {
      isClosed = false;

      this.message = "??";
      this.classStyle = "working";
      this.windowClass = "";
      this.status.description = connectionStatusConnected;
    },
    /**
     * Accumulates raw traffic counters for the current second window.
     *
     * Called by the socket layer for every inbound blob and every outbound
     * frame. Values are flushed into the history ring buffers by `update`.
     *
     * @param {number} inb - Number of inbound bytes in this event.
     * @param {number} outb - Number of outbound bytes in this event.
     * @returns {void}
     */
    traffic(inb, outb) {
      inboundPerSecond += inb;
      outboundPerSecond += outb;
    },
    /**
     * Updates the latency indicator from the latest echo round-trip time.
     *
     * Classifies the connection quality into four buckets (good / fair / median /
     * heavy) based on the rolling average delay and sets `classStyle`,
     * `windowClass`, and `status.description` accordingly.
     *
     * A `delay` equal to `ECHO_FAILED` indicates an unmeasurable connection and
     * triggers the red-flash error style.
     *
     * @param {number} delay - Round-trip echo delay in milliseconds, or
     *   `ECHO_FAILED` when the measurement could not be completed.
     * @returns {void}
     */
    echo(delay) {
      delayPerInterval += delay > 0 ? delay : 0;
      delaySamples++;

      if (delay == ECHO_FAILED) {
        this.status.delay = -1;
        this.message = "";
        this.classStyle = "red flash";
        this.windowClass = "red";
        this.status.description = connectionStatusUnmeasurable;

        return;
      }

      let avgDelay = Math.round(delayPerInterval / delaySamples);

      this.message = Number(avgDelay).toLocaleString() + "ms";
      this.status.delay = avgDelay;

      if (avgDelay < 30) {
        this.classStyle = "green";
        this.windowClass = "green";
        this.status.description =
          connectionStatusConnected + ". " + connectionDelayGood;
      } else if (avgDelay < 100) {
        this.classStyle = "yellow";
        this.windowClass = "yellow";
        this.status.description =
          connectionStatusConnected + ". " + connectionDelayFair;
      } else if (avgDelay < 300) {
        this.classStyle = "orange";
        this.windowClass = "orange";
        this.status.description =
          connectionStatusConnected + ". " + connectionDelayMedian;
      } else {
        this.classStyle = "red";
        this.windowClass = "red";
        this.status.description =
          connectionStatusConnected + ". " + connectionDelayHeavy;
      }
    },
    /**
     * Transitions the status indicator to the disconnected state.
     *
     * Marks all history entries as expired, resets `connector.inputting`, and
     * applies error styling when `e` is non-null.
     *
     * @param {Error|null} e - The close reason, or `null` for a clean disconnect.
     * @returns {void}
     */
    close(e) {
      isClosed = true;
      delayHistory.expire();
      inboundHistory.expire();
      outboundHistory.expire();

      ctx.connector.inputting = false;

      if (e === null) {
        this.message = "";
        this.classStyle = "";
        this.status.description = connectionStatusDisconnected;

        return;
      }

      this.status.delay = -1;
      this.message = "ERR";
      this.classStyle = "red flash";
      this.windowClass = "red";
      this.status.description = connectionStatusDisconnected + ": " + e;
    },
    /**
     * Transitions the status indicator to the error state when a dial attempt fails.
     *
     * Displays the WebSocket error code when available and applies the red-flash
     * indicator style. Resets `connector.inputting`.
     *
     * @param {{ code?: number } & Error} e - The error from the failed dial, optionally
     *   carrying a WebSocket close `code`.
     * @returns {void}
     */
    failed(e) {
      isClosed = true;

      ctx.connector.inputting = false;

      if (e.code) {
        this.message = "E" + e.code;
      } else {
        this.message = "E????";
      }

      this.status.delay = -1;
      this.classStyle = "red flash";
      this.windowClass = "red";
      this.status.description = connectionStatusDisconnected + ". Error: " + e;
    },
  };
}
