import React from "react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">© {new Date().getFullYear()} КастрюляМаркет — Магазин качественной посуды</div>
    </footer>
  );
}
