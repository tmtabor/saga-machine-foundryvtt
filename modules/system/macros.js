import { token_actor } from "./utils.js";
import { Test, test_dialog } from "../game/tests.js";

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {{type: string, stat:string|null, score:string|null, skill:string|null, tn:string|number|null,
 *          sceneId:string|null, tokenId: string|null, actorId:string|null}} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
export async function create_hotbar_macro(data, slot) {
    // Only create macro for tests
    if (data.type !== 'Test') return;

    // Verify that the actor may be retrieved
    const actor = token_actor({
        scene_id: data['sceneId'],
        token_id: data['tokenId'],
        actor_id: data['actorId']
    });
    if (!actor) return ui.notifications.warn("You can only create macro buttons for known actors");

    // Generate the test label
    const test = new Test({
        actor: actor,
        stat: data['stat'] || data['score'],
        skill: data['skill'],
        tn: data['tn']
    });
    const label = test.label

    // Get the icon, if any
    let skill = null;
    if (!!data['skill']) skill = game.items.find(i => i.name === data['skill'] && i.type === 'skill');

    // Create the macro command
    const data_string = JSON.stringify(data);
    const command = `game.sagamachine.sm_test_macro(${data_string});`;
    let macro = game.macros.find(m => (m.name === label) && (m.command === command));
    let macro_spec = {name: label, type: "script", command: command, flags: {"sagamachine.sm_test_macro": true}};
    if (skill) macro_spec['img'] = skill.img;
    if (!macro) macro = await Macro.create(macro_spec);

    // Assign to the hotbar
    await game.user.assignHotbarMacro(macro, slot);
    return false;
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {{sceneId: string|null, tokenId: string|null, actorId: string|null}} dataset
 */
export async function sm_test_macro(dataset) {
    // Get the actor from any embedded IDs
    let actor = token_actor({
        scene_id: dataset['sceneId'],
        token_id: dataset['tokenId'],
        actor_id: dataset['actorId']
    });

    // If no actor is available, look up using the speaker
    if (!actor) {
        const speaker = ChatMessage.getSpeaker();
        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);
        dataset['actorId'] = actor.id
    }

    await test_dialog(dataset);
}