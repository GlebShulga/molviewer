// jsdom has <dialog> without showModal() and close(). The smallest stand-in:
// open and close the dialog, and fire `close` as the browser does. Escape,
// Tab, inert and the top layer are checked in e2e, not here.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!proto.close) {
    proto.close = function (this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}
