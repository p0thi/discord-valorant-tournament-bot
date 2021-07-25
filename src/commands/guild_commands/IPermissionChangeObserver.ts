import { CommandPermissionRoles } from "../CustomApplicationCommand";
import IGuildCommand from "./IGuildCommand";

export default interface IPermissionChangeObserver {
  onPermissionChange(
    command: IGuildCommand,
    role: CommandPermissionRoles
  ): Promise<void>;
}
