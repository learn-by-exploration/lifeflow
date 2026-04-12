/**
 * Timer Worker - Runs timer independently of main thread
 * Prevents throttling when tab is backgrounded
 * 
 * Message Format:
 * - start: { cmd: 'start', duration: 1500000 } (milliseconds)
 * - pause: { cmd: 'pause' }
 * - resume: { cmd: 'resume' }
 * - stop: { cmd: 'stop' }
 * 
 * Responds with:
 * - tick: { type: 'tick', elapsed: 1000, remaining: 499000 }
 * - complete: { type: 'complete' }
 * - state: { type: 'state', elapsed: 1000, remaining: 499000, status: 'running' }
 */

class TimerWorker {
  constructor() {
    this.startTime = null;
    this.pausedTime = null;
    this.totalPausedDuration = 0;
    this.duration = 0;
    this.isRunning = false;
    this.intervalId = null;
    this.tickInterval = 100; // Update every 100ms for smooth ticking
  }

  start(duration) {
    if (this.isRunning) return;
    
    this.duration = duration;
    this.startTime = Date.now();
    this.pausedTime = null;
    this.totalPausedDuration = 0;
    this.isRunning = true;
    
    this._startTicking();
  }

  pause() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.pausedTime = Date.now();
    this._stopTicking();
  }

  resume() {
    if (this.isRunning) return;
    if (!this.pausedTime) return;
    
    this.totalPausedDuration += Date.now() - this.pausedTime;
    this.pausedTime = null;
    this.isRunning = true;
    
    this._startTicking();
  }

  stop() {
    this.isRunning = false;
    this._stopTicking();
    this.startTime = null;
    this.pausedTime = null;
    this.totalPausedDuration = 0;
  }

  _startTicking() {
    if (this.intervalId) clearInterval(this.intervalId);
    
    this.intervalId = setInterval(() => {
      const elapsed = this._getElapsed();
      const remaining = Math.max(0, this.duration - elapsed);
      
      // Send tick update
      self.postMessage({
        type: 'tick',
        elapsed,
        remaining,
        percentage: Math.min(100, Math.round((elapsed / this.duration) * 100))
      });
      
      // Check if complete
      if (remaining <= 0) {
        self.postMessage({ type: 'complete' });
        this.stop();
      }
    }, this.tickInterval);
  }

  _stopTicking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _getElapsed() {
    if (this.startTime === null) return 0;
    if (this.isRunning) {
      return Date.now() - this.startTime - this.totalPausedDuration;
    } else {
      return this.pausedTime - this.startTime - this.totalPausedDuration;
    }
  }

  getState() {
    return {
      type: 'state',
      elapsed: this._getElapsed(),
      remaining: Math.max(0, this.duration - this._getElapsed()),
      status: this.isRunning ? 'running' : (this.startTime ? 'paused' : 'idle'),
      duration: this.duration
    };
  }
}

const timer = new TimerWorker();

// Listen for commands from main thread
self.onmessage = (event) => {
  const { cmd, duration } = event.data;
  
  switch (cmd) {
    case 'start':
      timer.start(duration);
      self.postMessage(timer.getState());
      break;
    case 'pause':
      timer.pause();
      self.postMessage(timer.getState());
      break;
    case 'resume':
      timer.resume();
      self.postMessage(timer.getState());
      break;
    case 'stop':
      timer.stop();
      self.postMessage(timer.getState());
      break;
    case 'state':
      self.postMessage(timer.getState());
      break;
    default:
      console.warn('Unknown command:', cmd);
  }
};
