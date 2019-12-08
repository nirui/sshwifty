import { History } from "./commands/history.js";

export function build(ctx) {
  let rec = [];

  // This renames "knowns" to "sshwifty-knowns"
  // TODO: Remove this after some few years
  try {
    let oldStore = localStorage.getItem("knowns");

    if (oldStore) {
      localStorage.setItem("sshwifty-knowns", oldStore);
      localStorage.removeItem("knowns");
    }
  } catch (e) {
    // Do nothing
  }

  try {
    rec = JSON.parse(localStorage.getItem("sshwifty-knowns"));

    if (!rec) {
      rec = [];
    }
  } catch (e) {
    alert("Unable to load data of Known remotes: " + e);
  }

  return new History(
    rec,
    (h, d) => {
      try {
        localStorage.setItem("sshwifty-knowns", JSON.stringify(d));
        ctx.connector.knowns = h.all();
      } catch (e) {
        alert("Unable to save remote history due to error: " + e);
      }
    },
    64
  );
}
