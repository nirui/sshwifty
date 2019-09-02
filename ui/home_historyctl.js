import { History } from "./commands/history.js";

export function build(ctx) {
  let rec = [];

  try {
    rec = JSON.parse(localStorage.getItem("knowns"));

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
        localStorage.setItem("knowns", JSON.stringify(d));
        ctx.connector.knowns = h.all();
      } catch (e) {
        alert("Unable to save remote history due to error: " + e);
      }
    },
    64
  );
}
