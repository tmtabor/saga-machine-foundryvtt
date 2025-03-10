import { Test } from "../game/tests.js";
import { Effect } from "../game/damage.js";
import { ActionHelper } from "../item/item.js";

/**
 * Attach test data to the chat card
 *
 * @param {jQuery} html
 * @return {Promise<void>}
 */
export async function attach_test_data(html) {
    if (!html.find('.damage').length) return;  // Do nothing if no damage to attach

    // Is the first hit a critical hit?
    let critical = !!html.find('.critical').length;

    // Gather data for all hits
    const hits = [];
    html.find('.damage').each((i, e) => {
        const damage = Number($(e).text());
        const damage_type = $(e).parent().find('.damage-type').text();
        const pierce_armor = Number($(e).data('pierce')) || 0;
        hits.push({damage: damage, damageType: damage_type, critical: critical, pierce: pierce_armor});
        critical = false; // Subsequent hits aren't critical
    });

    // Attach drag listener
    html[0].setAttribute("draggable", true);	// Add draggable and dragstart listener
    html[0].addEventListener("dragstart", ev => {
        ev.currentTarget.dataset['hits'] = JSON.stringify(hits);
        ev.dataTransfer.setData("text/plain", JSON.stringify({hits: hits}));
    }, false);
}

/**
 * Apply damage from a chat card, dropped onto an actor's character sheet
 *
 * @param {SagaMachineActor} actor
 * @param data
 * @return {Promise<void>}
 */
export async function drop_chat_damage(actor, data) {
    if (data['hits'])
        for (let hit of data['hits'])
            await actor.apply_damage(hit['damage'], hit['damageType'], hit['critical'], hit['pierce']);
}

/**
 * Add the Push Luck menu item to chat cards
 *
 * @param {ContextMenuEntry[]} options
 * @return {Promise<void>}
 */
export async function add_push_luck(options) {
    options.push({
        name: 'Push Your Luck',
        icon: '<i class="fas fa-dice"></i>',
        condition: html => !!html.find('.test-json').length,
        callback: async html => {
            // Recreate test object from json
            const test = Test.from_json(JSON.parse(html.find('.test-json').val()));

            // Check for ownership
            if (!test?.actor?.isOwner)
                return ui.notifications.warn("You can't Push Your Luck for this character.");

            // Check for enough luck
            if (test?.actor?.system?.scores?.luck?.value <= 0)
                return ui.notifications.warn("The character doesn't have enough Luck.");

            // Add additional boon, mark luck tag and re-evaluate
            test.boons++;
            if (game.settings.get('saga-machine', 'stress'))
                test.stress_boons++;
            test.use_luck = true;
            await test.evaluate()

            // Decrement luck
            test.actor.update({'system.scores.luck.value': test.actor.system.scores.luck.value - 1});

            // Apply any immediate test consequences
            await test.apply_effects();

            // Display the new chat card
            await test.to_chat({ whisper: html.hasClass('whisper'), rolls: [test.results] });
        }
    });
}

/**
 * Add the Apply Damage menu option to chat cards
 *
 * @param {ContextMenuEntry[]} options
 * @return {Promise<void>}
 */
export async function add_apply_damage(options) {
    options.push({
        name: 'Apply Damage',
        icon: '<i class="fas fa-user-minus"></i>',
        condition: html => !!html.find('.damage').length,
        callback: html => {
            // Get all selected tokens
            let tokens = game?.canvas?.tokens?.controlled;

            // If there are no valid tokens, and you are the GM, give a warning
            if (!tokens.length && game.user.isGM) { ui.notifications.warn("No valid character selected."); return; }

            // Filter for owned token actors, falling back to player character is none are selected
            let valid_tokens = tokens.filter(t => t?.document?.actor?.isOwner)
            if (!valid_tokens.length && game.user.character) valid_tokens = [game.user.character];

            // For all valid actors
            for (let token of valid_tokens) {
                let actor = token?.document?.actor;
                if (actor && actor.isOwner) {
                    // Is the first hit a critical hit?
                    let critical = !!html.find('.critical').length;

                    // Apply each damage
                    html.find('.damage').each((i, e) => {
                        const damage = Number($(e).text());
                        const damage_type = $(e).parent().find('.damage-type').text();
                        const pierce_armor = Number($(e).data('pierce')) || 0;

                        actor.apply_damage(damage, damage_type, critical, pierce_armor);
                        critical = false; // Subsequent hits aren't critical
                    });
                }
            }
        }
    });
}

/**
 * Add the Edit Test menu option to chat cards for GMs
 *
 * @param {ContextMenuEntry[]} options
 * @return {Promise<void>}
 */
export async function add_edit_test(options) {
    options.push({
        name: 'Edit Results',
        icon: '<i class="fa fa-edit"></i>',
        condition: html => game.user.isGM,
        callback: html => {
            const message_id = html.data('messageId');
            const test = Test.from_json(JSON.parse(html.find('.test-json').val()));

            // Open edit dialog
            new Dialog({
                title: `Edit Results`,
                content: `
                    <form class="saga-machine">
                        <div class="form-group">
                            <label for="critical">Success</label>
                            <input type="checkbox" name="success" ${test.success ? 'checked' : ''}>
                        </div>
                        <div class="form-group">
                            <label for="critical">Critical</label>
                            <input type="checkbox" name="critical" ${test.critical ? 'checked' : ''}>
                        </div>
                        <div class="form-group">
                            <label for="value">Margin</label>
                            <input type="number" name="margin" value="${test.margin}" autofocus>
                        </div>
                        <div class="sheet-body">
                            <ol class="items-list consequence-list">
                                <li class="item flexrow items-header consequence-row">
                                    <div class="item-name">Type</div>
                                    <div class="item-name">Value</div>
                                    <div class="item-controls">
                                        <a class="item-control item-create" title="Create effect"><i class="fas fa-plus"></i> Add</a>
                                    </div>
                                </li>
                
                                <li class="item flexrow consequence consequence-row prototype">
                                    <select class="item-input item-name" name="type">
                                        <option value="damage">Damage</option>
                                        <option value="consequence">Consequence</option>
                                        <option value="defense">Defense</option>
                                        <option value="message">Message</option>
                                    </select>
                                    <input class="item-input item-name" type="text" name="value" value="" />
                                    <div class="item-controls">
                                        <a class="item-control item-delete" title="Delete Item"><i class="fas fa-trash"></i></a>
                                    </div>
                                </li>
                            </ol>
                        </div>
                    </form>`,
                render: html => {
                    // Fill out existing consequences
                    if (test.effects && test.effects.length) {
                        // Get the prototype consequence node and parent node
                        const prototype = html.find('.consequence.prototype');
                        const parent = html.find('ol.consequence-list');

                        // For each effect, clone the prototype and set up the form
                        for (let effect of test.effects) {
                            let value = null;
                            switch (effect.type) {
                                case 'consequence': value = effect.name; break;
                                case 'damage': value = `${Number(effect.value) + (Number(effect.margin) || Number(test.margin))} ${effect.damage_type} ${effect.properties}`; break;
                                case 'message': value = `${effect.key}: ${effect.value}`; break;
                                default: value = '';
                            }

                            const clone = prototype.clone();
                            clone.removeClass('prototype');
                            clone.find("[name=type]").val(effect.type);
                            clone.find("[name=value]").val(value);
                            parent.append(clone);
                        }
                    }

                    html.find('.consequence-list .item-create').click(event => {
                        // Get the prototype consequence node and parent node, return if it wasn't found
                        const prototype = html.find('.consequence.prototype');
                        const parent = html.find('ol.consequence-list');
                        if (!prototype || !prototype.length || !parent || !parent.length) return;

                        const clone = prototype.clone();
                        clone.removeClass('prototype');
                        clone.find('.item-delete').click(event => $(event.currentTarget).closest(".consequence").remove());
                        parent.append(clone);
                    });
                    html.find('.consequence-list .item-delete').click(event => $(event.currentTarget).closest(".consequence").remove());
                },
                buttons: {
                    Edit: {
                        icon: "<i class='fas fa-check'></i>",
                        label: 'OK',
                        callback: async (html) => {
                            // Set values based on the contents of the form
                            test.success = html.find("input[name=success]").is(':checked');
                            test.critical = html.find("input[name=critical]").is(':checked');
                            test.margin = Number(html.find("input[name=margin]").val());
                            test.edited = true;

                            const effects = [];
                            html.find('.consequence:not(.prototype)').each((i, e) => {
                                const type = $(e).find('select[name=type]').val();
                                const value = $(e).find('input[name=value]').val();

                                const params = {};
                                if      (type === 'consequence') params.name = value.trim();
                                else if (type === 'message') {
                                    const parts = value.split(': ');
                                    if (parts.length >= 2) [params.key, params.value] = [parts[0], parts[1]];
                                    else [params.key, params.value] = ['Message', parts[0]];
                                }
                                else if (type === 'damage') {
                                    const parts = value.split(' ');
                                    params.value = Number(parts?.[0]) - test.margin;
                                    params.damage_type = parts?.[1];
                                    if (parts.length >= 3) params.properties = ActionHelper.parse_properties(parts.slice(2).join(' '));
                                }

                                const effect = new Effect({type: type, ...params}, test);
                                effect.apply(test.success ? 'success' : 'failure')
                                effects.push(effect);
                                test.effects = effects;
                            });

                            // Save edited card
                            await ChatMessage.updateDocuments([{_id: message_id, content: test.content(), flavor: test.flavor()}], {});
                        }
                    }
                }
            }).render(true);
        }
    });
}