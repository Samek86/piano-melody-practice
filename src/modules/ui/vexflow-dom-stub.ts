if (typeof globalThis.document === 'undefined') {
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: () => ({
            measureText: () => ({
              width: 10,
              actualBoundingBoxAscent: 8,
              actualBoundingBoxDescent: 2,
              fontBoundingBoxAscent: 8,
              fontBoundingBoxDescent: 2,
              actualBoundingBoxLeft: 0,
              actualBoundingBoxRight: 10
            }),
            font: ''
          })
        };
      }
      return { style: {} };
    }
  };
}
