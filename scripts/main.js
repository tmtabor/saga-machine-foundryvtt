import { SagaMachineActor } from "./actor.js";
import { SagaMachineActorSheet } from "./actor-sheet.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";

CONFIG.debug.hooks = true;

/**
 * Init hook.
 */
Hooks.once("init", async () => {
    console.log(`Initializing Saga Machine`);

  // game['saga-machine'] = {
  //   SagaMachineActor: SagaMachineActor
  // };
  // console.log(game);

  // Define custom Entity classes
  CONFIG.Actor.documentClass = SagaMachineActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Register sheet application classes
  Actors.registerSheet("saga-machine", SagaMachineActorSheet, { makeDefault: true });
  Items.registerSheet("saga-machine", SimpleItemSheet, { makeDefault: true });
});