import { controlService } from "./systemd-service.js";

await controlService( "start" );
