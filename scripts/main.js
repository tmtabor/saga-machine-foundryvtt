import { SagaMachineActor } from "./actor.js";
import { SagaMachineActorSheet } from "./actor-sheet.js";
import { SagaMachineItem } from "./item.js";
import { SagaMachineItemSheet } from "./item-sheet.js";

// Turn on debugging
CONFIG.debug.hooks = true;

/**
 * Init hook.
 */
Hooks.once("init", async () => {
    console.log(`Initializing Saga Machine`);

    // Add classes to global game variable
    game.sagamachine = {
        SagaMachineActor,
        SagaMachineItem
    };

    // Define custom document classes
    CONFIG.Actor.documentClass = SagaMachineActor;
    CONFIG.Item.documentClass = SagaMachineItem;

    // Register sheet application classes
    Actors.registerSheet("saga-machine", SagaMachineActorSheet, { makeDefault: true });
    Items.registerSheet("saga-machine", SagaMachineItemSheet, { makeDefault: true });

    // Register handlebars helpers
    Handlebars.registerHelper("is_GM", () => game.user.isGM);
    Handlebars.registerHelper("is_weapon", item => item.system.group.toLowerCase() === 'weapon');
    Handlebars.registerHelper("is_armor", item => item.system.group.toLowerCase() === 'armor');
});