import IGuildCommand from "./IGuildCommand";
import IGuildCommandObserver from "./IGuildCommandObserver";

export default abstract class AObservableCommand {
  protected observers: Array<IGuildCommandObserver> = [];

  abstract notifyObservers(): void;

  addObserver(observer: IGuildCommandObserver): void {
    if (this.observers.includes(observer)) {
      return;
    }
    this.observers.push(observer);
  }

  removeObserver(observer: IGuildCommandObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }
}
