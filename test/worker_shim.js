// jsdom has no Web Worker. Execute the shipped Blob source in real Node threads,
// preserving structured cloning, task isolation, errors and termination in UI tests.
const { Worker: NodeWorker } = require('node:worker_threads');
module.exports = function installWorker(w) {
  const blobs = new Map(), workers = new Set(); let next = 0;
  w.Blob = Blob;
  w.URL.createObjectURL = blob => { const url = 'blob:test-' + (++next); blobs.set(url, blob); return url; };
  w.URL.revokeObjectURL = url => blobs.delete(url);
  w.Worker = class {
    constructor(url) {
      const blob = blobs.get(url); if (!blob) throw new Error('Unknown worker Blob');
      this.ready = blob.text().then(code => {
        if (this.stopped) return;
        this.worker = new NodeWorker(`
          const { parentPort, workerData } = require('node:worker_threads');
          globalThis.WorkerGlobalScope = class { static [Symbol.hasInstance]() { return true; } };
          globalThis.postMessage = data => parentPort.postMessage(data);
          new Function('module', 'require', workerData)(undefined, undefined);
          parentPort.on('message', data => globalThis.onmessage({ data }));
        `, { eval: true, workerData: code });
        this.worker.on('message', data => { this.onmessage?.({ data }); if (!data.progress) this.worker.unref(); });
        this.worker.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} }));
        workers.add(this); this.worker.unref();
      });
    }
    postMessage(data) { this.ready.then(() => { if (!this.stopped) { this.worker.ref(); this.worker.postMessage(data); } }); }
    terminate() { this.stopped = true; this.worker?.terminate(); workers.delete(this); }
  };
  const close = w.close.bind(w); w.close = () => { workers.forEach(worker => worker.terminate()); close(); };
};
