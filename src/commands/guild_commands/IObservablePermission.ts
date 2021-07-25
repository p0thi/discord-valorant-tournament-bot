import IPermissionChangeObserver from "./IPermissionChangeObserver";

export default interface IObservablePermission {
  addPermissionObserver(observer: IPermissionChangeObserver): void;
}
