export class InputManager {
  keys: Record<string, boolean> = {};
  mouseButtons: Record<number, boolean> = {};
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  private canvas: HTMLCanvasElement;
  private accDX = 0;
  private accDY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.addEventListener("click", this.requestPointerLock);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    this.mouseButtons[e.button] = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtons[e.button] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.locked) {
      this.accDX += e.movementX;
      this.accDY += e.movementY;
    }
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  private requestPointerLock = () => {
    if (!this.locked) {
      this.canvas.requestPointerLock();
    }
  };

  consumeMouse() {
    this.mouseDX = this.accDX;
    this.mouseDY = this.accDY;
    this.accDX = 0;
    this.accDY = 0;
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }

  isMouseDown(btn: number): boolean {
    return !!this.mouseButtons[btn];
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.canvas.removeEventListener("click", this.requestPointerLock);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }
}
