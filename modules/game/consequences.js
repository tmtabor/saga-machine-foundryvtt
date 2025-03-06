/**
 * Put the standard Saga Machine consequences in the formated expected for Foundry status effects
 *
 * @return {{icon: string, statuses: string[], name: string, id: string, flags:{core: {overlay: string[]}, system: *}}[]}
 */
export const generate_conditions = () => {
    const system_conditions = [];
    const standard_consequences = ['Bleeding', 'Bolstered', 'Dazed', 'Defeated', 'Desire', 'Disabled', 'Dying', 'Fatigue',
      'Fear', 'Fixation', 'Grave Wound', 'Hidden', 'Hindered', 'Prone', 'Stunned', 'Wound'];

    // Generate and append an object for each consequence
    standard_consequences.forEach(consequence => system_conditions.push({
        icon: `systems/saga-machine/images/consequences/${consequence.slugify()}.svg`,
        statuses: [consequence.slugify()],
        name: consequence,
        id: consequence.slugify(),
        flags: {
            core: { overlay: ['Defeated'].includes(consequence) },
            system: {
                subject_prompt: ['Bleeding', 'Desire', 'Fear', 'Fixation'].includes(consequence),
                value_prompt: ['Fatigue', 'Grave Wound', 'Wound'].includes(consequence),
                remove_others: ['Desire', 'Fixation'].includes(consequence),
                no_consequence: ['Defeated', 'Unconscious'].includes(consequence)
            }
        }
    }));

    return system_conditions;
}

/**
 * Get a reference to a standard Saga Machine consequence if one exists on the actor, if not check for one globally, if
 * not lazily create one.
 *
 * @param name - The name of the consequence
 * @param actor - The actor to check
 * @param skip_actor - Skip checking the actor?
 * @param skip_global - Skip checking the global/game scope?
 * @param skip_new - Skip lazy creation?
 * @return {Promise<SagaMachineItem|null>}
 */
export async function standard_consequence({name, actor, skip_actor=false, skip_global=false, skip_new=false}) {
    let consequence = null;

    // Get the existing consequence on this actor, if one exists
    if (!skip_actor)
        consequence = actor?.items.filter(c => c.name === name && c.type === "consequence")
            .values().next()?.value;

    // If the consequence was not found, check for a matching globally defined consequence
    if (!skip_global && !consequence)
        consequence = game.items.filter(c => c.name === name && c.type === "consequence")
            .values().next()?.value;

    // If the consequence was still not found, create a dummy one
    if (!skip_new && !consequence)
        consequence = await Item.create({
            name: name.capitalize(),
            type: 'consequence',
            system: { rank: 1 }
        });

    return consequence;
}

/**
 * Sync the actor's status effects with its consequences
 *
 * @param actor - The actor to sync
 * @return {Promise<void>}
 */
export async function sync_status(actor) {
    // Get the consequences and statuses
    const consequences = new Set(actor.items.filter(item => item.type === "consequence" && item.system.rank > 0 &&
        game.sagamachine.standard_consequences.includes(item.name)).map(c => c.name.slugify()));
    const statuses = actor.statuses;

    // Get the items that need synced
    const add_set = consequences.difference(statuses);
    const remove_set = statuses.difference(consequences);

    // Special case for defeated and unconscious, which have no consequence
    remove_set.delete('defeated');
    remove_set.delete('unconscious');

    // Add missing statuses
    const status_list = [];
    CONFIG.statusEffects.forEach(e => {
        if (add_set.has(e.id)) status_list.push(foundry.utils.deepClone(e));
    });
    if (status_list.length)
        await actor.createEmbeddedDocuments("ActiveEffect", status_list);

    // Remove stale statuses
    if (remove_set.size)
        await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.filter(e => remove_set.has(e.name.slugify())).map(e => e.id));

    // Remove duplicate statuses, if necessary
    const status_set = new Set(actor.effects.map(e => e.name));
    if (status_set.size !== actor.effects.size) {
        for (const s of status_set) {
            if (!game.sagamachine.standard_consequences.includes(s)) return;
            const matches = actor.effects.filter(e => e.name === s);
            if (matches.length > 1) {
                matches.shift();
                await actor.deleteEmbeddedDocuments("ActiveEffect", matches.map(e => e.id));
            }
        }
    }
}

/**
 * Sync the item's active effects with its parent actor
 *
 * @param item - The item with active effects to sync
 * @param delete_only - Only delete active effects, do not add
 * @return {Promise<void>}
 */
export async function sync_effects(item, delete_only=false) {
    // Find item effects, delete those effects, return if delete_only
    const matches = item.parent.effects.filter(e => e.origin === item.uuid);
    for (let e of matches) e.delete();
    if (delete_only) return;

    // Copy all item effects to actor
    const copies = [];
    for (let e of item.effects) copies.push(e.clone({ parent: item.parent, origin: item.uuid }));
    item.parent.createEmbeddedDocuments('ActiveEffect', copies);
}

/**
 * Evaluate variables embedded in active effects
 *
 * @param value - Active effect value
 * @param item - Item to which the active effect belongs
 * @return {string} - The evaluated active effect value
 */
export function evaluate_formula(value, item) {
    function substitute_variables(raw, item) {
        raw = raw.replaceAll('@rank', item.system.rank);
        if (item.parent)
            raw =     raw.replaceAll('@str', item.parent.system.stats.strength.value)
                         .replaceAll('@dex', item.parent.system.stats.dexterity.value)
                         .replaceAll('@spd', item.parent.system.stats.speed.value)
                         .replaceAll('@end', item.parent.system.stats.endurance.value)
                         .replaceAll('@int', item.parent.system.stats.intelligence.value)
                         .replaceAll('@per', item.parent.system.stats.perception.value)
                         .replaceAll('@chr', item.parent.system.stats.charisma.value)
                         .replaceAll('@det', item.parent.system.stats.determination.value);
        return raw;
    }

    const do_math = raw => Function(`'use strict'; return (${raw})`)();
    const to_evaluate = ['boons', 'banes', 'modifier', 'divide', 'percent'];
    const params = new URLSearchParams(value.replaceAll('+', '%2b'));
    for (const p of to_evaluate)
        if (params.has(p)) params.set(p, do_math(substitute_variables(params.get(p), item)));

    return params.toString();
}

/**
 * Evaluate all @-style variables in active effect and replace with the literal values
 *
 * @param {ActiveEffect} effect
 * @return {Promise<boolean>}
 */
export async function evaluate_effect_variables(effect) {
    const item = await fromUuid(effect.origin);               // Get the item
    if (!item) return true;                                                 // If not valid item, do nothing
    for (let change of effect.changes)                                 // For each change in the Active Effect
        change.value = evaluate_formula(change.value, item);                // Replace variables, do math
    await effect.updateSource({'changes': effect.changes});                 // Update the effect being added

    return true;
}

/**
 * Sync effects applied from the UI with consequences on the actor - after adding an effect
 *
 * @param {ActiveEffect} effect
 * @return {Promise<void>}
 */
export async function add_effect_from_ui(effect) {
        const actor = effect.target;
        const status_name = effect.statuses.first();

        // If this status doesn't have a corresponding consequence, return
        if (effect?.flags?.system?.no_consequence) return;

        // Get the existing consequence on this actor, if one exists
        let consequence = actor.items.filter(c => c.name.slugify() === status_name && c.type === "consequence")
            .values().next()?.value;
        if (consequence) return;  // Return if found

        // If the consequence was not found, check for a matching globally defined consequence
        consequence = game.items.filter(c => c.name === effect.name && c.type === "consequence")
            .values().next()?.value;

        // If the consequence was still not found, create a dummy one
        if (!consequence)
            consequence = await Item.create({
                name: status_name.capitalize(),
                type: 'consequence',
                system: { rank: 1 }
            });

        // If this consequence accepts a subject, prompt the user for it
        if (effect?.flags?.system?.subject_prompt)
            new Dialog({
                title: `Specify Subject of ${consequence.name}`,
                content: `
                    <form>
                        <div class="form-group">
                            <label for="subject">Subject</label>
                            <input type="text" name="subject" value="" autofocus>
                        </div>
                    </form>`,
                buttons:{
                    Confirm: {
                        icon: "<i class='fas fa-check'></i>",
                        label: 'OK',
                        callback: async (html) => {
                            const subject = html.find("[name=subject]").val().trim();  // Get the user set subject

                            // Update the subject
                            consequence.update({'system.specialization': subject, 'system.rank': 1});
                            consequence.system.specialization = subject;

                            // Special case for Desire and Fixated: remove other copies with a different subject
                            if (effect?.flags?.system?.remove_others)
                                actor.items.filter(c => c.name === consequence.name && c.type === "consequence" &&
                                    c.system.specialization !== subject).forEach(c => c.delete());
                        }
                    }
                },
                default: 'Confirm'
            }).render(true);

        // Prompt for consequence value
        if (effect?.flags?.system?.value_prompt)
            new Dialog({
                title: `Specify Descriptor and Value of ${consequence.name}`,
                content: `
                    <form>
                        <div class="grid grid-2col">
                            <label for="subject">Descriptor (optional)</label>
                            <input type="text" name="subject" value="" autofocus>
                            <label for="value">Value</label>
                            <input type="number" name="value" value="1">
                        </div>
                    </form>`,
                buttons:{
                    Confirm: {
                        icon: "<i class='fas fa-check'></i>",
                        label: 'OK',
                        callback: async (html) => {
                            const subject = html.find("[name=subject]").val().trim();       // Get the user set subject
                            const value = parseInt(html.find("[name=value]").val()) || 1;   // Get the user set value

                            // Create update object
                            const update = { 'system.rank': value };
                            if (subject) update['system.specialization'] = subject;

                            // Update the subject and value
                            consequence.update({'system.specialization': subject, 'system.rank': value});
                        }
                    }
                },
                default: 'Confirm'
            }).render(true);

        // Add a copy to the actor
        [consequence] = await actor.createEmbeddedDocuments('Item', [consequence]);
}

/**
 * Sync effects applied from the UI with consequences on the actor - after removing an effect
 *
 * @param {ActiveEffect} effect
 * @return {Promise<void>}
 */
export async function remove_effect_from_ui(effect) {
    const actor = effect.target

    // Get the existing consequence on this actor, if one exists
    let consequences = actor.items.filter(c => c.name === effect.name && c.type === "consequence");

    // Remove any matching consequences
    if (consequences.length)
        await actor.deleteEmbeddedDocuments("Item", consequences.map(c => c.id));
}

/**
 * When removing an effect from the UI that is ambiguious (e.g. has multiple instances or subjects), prompt the user
 *
 * @param {ActiveEffect} effect
 * @return {boolean}
 */
export function prompt_on_effect_deletion(effect) {
        const actor = effect.target

        let consequences = actor.items.filter(c => c.name === effect.name && c.type === "consequence");
        if (!consequences.length) return true;
        if (consequences.length > 1 || effect?.flags?.system?.value_prompt) {
            let content = '<form><div class="grid grid-2col">';
            consequences.forEach(c => {
                const rank_display = effect?.flags?.system?.value_prompt || c.system.rank > 1 ? c.system.rank : '';
                content += `<input type="radio" name="consequence" value="${c.id}" />
                            <label for="consequence">${c.system.full_name} ${rank_display}</label>`
            });
            content += '</div></form>';

            new Dialog({
                title: `Select Which ${consequences[0].name} to Remove`,
                content: content,
                buttons: {
                    Confirm: {
                        icon: "<i class='fa fa-trash'></i>",
                        label: 'Remove',
                        callback: async (html) => {
                            const delete_id = html.find("input[name=consequence]:checked").val();
                            if (delete_id) await actor.deleteEmbeddedDocuments("Item", [delete_id]);
                        }
                    }
                },
                default: 'Confirm'
            }).render(true);

            return false;
        }

        return true;
}
