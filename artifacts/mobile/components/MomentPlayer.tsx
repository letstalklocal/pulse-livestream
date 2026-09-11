import React from "react";
export default function MomentPlayer({ uri }: { uri: string }) {
  return React.createElement("video", {
    src: uri,
    controls: true,
    autoPlay: true,
    playsInline: true,
    style: { width: "100%", height: "100%", background: "black" },
  });
}
