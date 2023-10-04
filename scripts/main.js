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

    // Register Saga Machine sheet classes
    Actors.registerSheet("saga-machine", SagaMachineActorSheet, { makeDefault: true });
    Items.registerSheet("saga-machine", SagaMachineItemSheet, { makeDefault: true });

    // Unregister the core sheets
    Actors.unregisterSheet("core", ActorSheet);
    Items.unregisterSheet("core", ItemSheet);

    // Register system config
    game.settings.register('saga-machine', 'level', {
        name: 'Starting Power Level',
        hint: 'The starting power level of all player characters.',
        scope: 'world',
        config: true,
        type: Number,
        default: 150,
        choices: {
            85: "Mundane",
            120: "Novice",
            160: "Exceptional",
            200: "Distinguished",
            240: "Renowned",
            280: "Legendary"
        }
    });
});
