import { SagaMachineActor } from "./actor.js";
import { SagaMachineActorSheet } from "./actor-sheet.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";

CONFIG.debug.hooks = true;

/**
 * Init hook.
 */
Hooks.once("init", async function() {
    console.log(`Initializing Saga Machine System`);

  // game['saga-machine'] = {
  //   SagaMachineActor: SagaMachineActor
  // };
  // console.log(game);

  // Define custom Entity classes
  CONFIG.Actor.documentClass = SagaMachineActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
  Actors.registerSheet("saga-machine", SagaMachineActorSheet, { makeDefault: true });
  Items.registerSheet("saga-machine", SimpleItemSheet, { makeDefault: true });

  /**
   * Slugify a string.
   */
  // Handlebars.registerHelper('slugify', function(value) {
  //   return value.slugify({strict: true});
  // });

  // Preload template partials
  await loadTemplates([
    "systems/saga-machine/templates/parts/sheet-attributes.html",
    "systems/saga-machine/templates/parts/sheet-groups.html"
  ]);
});