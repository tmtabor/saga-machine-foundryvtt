import { SagaMachineActor } from "./actor.js";
import { SagaMachineActorSheet } from "./actor-sheet.js";
import { SMCombatTracker } from "./combat.js";
import { SagaMachineItem } from "./item.js";
import { SagaMachineItemSheet } from "./item-sheet.js";
import { sm_test_macro } from "./tests.js";

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
        SagaMachineItem,
        sm_test_macro
    };

    // Define custom document classes
    CONFIG.Actor.documentClass = SagaMachineActor;
    CONFIG.Item.documentClass = SagaMachineItem;
    CONFIG.ui.combat = SMCombatTracker

    // Register sheet application classes
    Actors.registerSheet("saga-machine", SagaMachineActorSheet, { makeDefault: true });
    Items.registerSheet("saga-machine", SagaMachineItemSheet, { makeDefault: true });

    // Register system config
    // game.settings.register('saga-machine', 'theme', {
    //     name: 'Theme',
    //     hint: 'The theme to use for logos and the style of the default character and item sheets',
    //     scope: 'world',
    //     config: true,
    //     type: String,
    //     default: 'default',
    //     choices: {
    //         "default": "Saga Machine Unified"
    //     }
    // });

    // Register handlebars helpers
    Handlebars.registerHelper("is_GM", () => game.user.isGM);
    Handlebars.registerHelper("is_weapon", item => item.system.group.toLowerCase() === 'weapon');
    Handlebars.registerHelper("is_armor", item => item.system.group.toLowerCase() === 'armor');
});
