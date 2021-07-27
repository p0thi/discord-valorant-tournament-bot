import { CommandPermissionRole } from "../CustomApplicationCommand";
import IGuildCommand from "./IGuildCommand";

export default interface IPermissionChangeObserver {
  onPermissionChange(
    command: IGuildCommand,
    role: CommandPermissionRole
  ): Promise<void>;
}
