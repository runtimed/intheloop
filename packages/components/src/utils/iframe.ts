function throwIfNotInIframe() {
  if (window.self === window.top) {
    throw new Error(
      "This content must be rendered inside an iframe for security reasons."
    );
  }
}

export { throwIfNotInIframe };
