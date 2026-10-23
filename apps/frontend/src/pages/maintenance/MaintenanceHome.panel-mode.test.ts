import { describe, expect, it } from "vitest";
import ts from "typescript";
import sourceText from "./MaintenanceHome.tsx?raw";

const source = ts.createSourceFile("MaintenanceHome.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

describe("Maintenance Home panel mode isolation", () => {
  for (const [component, panel] of [["ArrivingSoonPage", "arriving_soon"], ["PredictiveAlertsPage", "predictive_alerts"]]) {
    it(`${component} remounts between compact and full views`, () => {
      let keyExpression = "";
      function visit(node: ts.Node) {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === component) {
          const key = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "key");
          if (key && ts.isJsxAttribute(key) && key.initializer && ts.isJsxExpression(key.initializer)) keyExpression = key.initializer.expression?.getText(source) ?? "";
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      // Remounting resets ParityTable's mount-only hidden columns and the
      // Arriving Soon filters; compact copy must again mean yard / 48 hours.
      expect(keyExpression).toContain(`expandedHomePanel === "${panel}"`);
      expect(keyExpression).toContain('"full" : "compact"');
    });
  }
});
