import React from "react";
import { createRoot } from "react-dom/client";
import { create, fromJson } from "@bufbuild/protobuf";
import { PanelDescriptorSchema } from "@savvifi/meridian-proto-ts";
import { ThemeSchema } from "@savvifi/meridian-proto-ts/proto/theme_pb.js";
import {
  htmlKit,
  MeridianProvider,
  PanelRenderer,
} from "@savvifi/meridian-web-react";
import descriptor from "./panel.json";

const panel = fromJson(PanelDescriptorSchema, descriptor);
const theme = create(ThemeSchema);
const invoker = {
  async invoke() {
    throw new Error("This example has no RPC backend.");
  },
};

createRoot(document.getElementById("app")).render(
  <MeridianProvider kit={htmlKit} theme={theme} invoker={invoker} adhoc={{}}>
    <PanelRenderer descriptor={panel} />
  </MeridianProvider>,
);
