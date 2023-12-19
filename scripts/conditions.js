export const generate_conditions = () => {
    const system_conditions = [];
    const standard_consequences = ['Bleeding', 'Bolstered', 'Dazed', 'Defeated', 'Desire', 'Disabled', 'Dying', 'Fatigue',
      'Fear', 'Fixated', 'Grave Wound', 'Hidden', 'Hindered', 'Prone', 'Stun', 'Wound'];

    // Generate and append an object for each consequence
    standard_consequences.forEach(consequence => system_conditions.push({
        icon: `systems/saga-machine/images/consequences/${consequence.slugify()}.svg`,
        statuses: [consequence.slugify()],
        name: consequence,
        id: consequence.slugify(),
        flags: {
            core: { overlay: ['Defeated'].includes(consequence) },
            system: {
                subject_prompt: ['Bleeding', 'Desire', 'Fear', 'Fixated'].includes(consequence),
                value_prompt: ['Fatigue', 'Grave Wound', 'Wound'].includes(consequence),
                remove_others: ['Desire', 'Fixated'].includes(consequence),
                no_consequence: ['Defeated', 'Unconscious'].includes(consequence)
            }
        }
    }));

    return system_conditions;
}

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

async function sync_status(actor) {
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
}

Hooks.on("createItem", async (item, options, id) => {
    // Only run this if it is you creating the item, not for other players
    if (game.user.id !== id) return;

    // Sync consequences with status effects
    if (item.type === "consequence" && item.parent) await sync_status(item.parent);
});

Hooks.on("deleteItem", async (item, options, id) => {
    // Only run this if it is you deleting the item, not for other players
    if (game.user.id !== id) return;

    // Sync consequences with status effects
    if (item.type === "consequence" && item.parent) await sync_status(item.parent);
});

Hooks.on("updateItem", async (item, change, options, id) => {
    // Only run this if it is you updating the item, not for other players
    if (game.user.id !== id) return;

    // Sync consequences with status effects
    if (item.type === "consequence" && item.parent) await sync_status(item.parent);
});

Hooks.on("createActiveEffect", async (effect, options, id) => {
    // Only run this if it is you creating the active effect, not for other players
    if (game.user.id !== id) return;

    // If this is a status applied directly from the UI
    if (!effect.origin && effect.statuses?.size && effect.target) {
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
});

Hooks.on("preDeleteActiveEffect", (effect, options, id) => {
    // Only run this if it is you deleting the active effect, not for other players
    if (game.user.id !== id) return;

    const actor = effect.target

    // If using the status UI to delete a consequence with a subject, stop and prompt
    if (!effect.origin && effect.statuses?.size &&
        (effect?.flags?.system?.subject_prompt || effect?.flags?.system?.value_prompt)) {
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
    }
});

Hooks.on("deleteActiveEffect", async (effect, options, id) => {
    // Only run this if it is you deleting the active effect, not for other players
    if (game.user.id !== id) return;

    // If this is a status applied directly from the UI
    if (!effect.origin && effect.statuses?.size && effect.target) {
        const actor = effect.target

        // Get the existing consequence on this actor, if one exists
        let consequences = actor.items.filter(c => c.name === effect.name && c.type === "consequence");

        // Remove any matching consequences
        if (consequences.length)
            await actor.deleteEmbeddedDocuments("Item", consequences.map(c => c.id));
    }
});
