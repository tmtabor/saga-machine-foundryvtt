/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
export async function create_hotbar_macro(data, slot) {
    if (!("actorId" in data)) return ui.notifications.warn("You can only create macro buttons for known actors");

    const data_string = JSON.stringify(data);
    const test_name = test_syntax(data['stat'] || data['score'], data['skill'], data['tn']);

    // Get the icon, if any
    let skill = null;
    if (!!data['skill']) skill = game.items.find(i => i.name === data['skill'] && i.type === 'skill');

    // Create the macro command
    const command = `game.sagamachine.sm_test_macro(${data_string});`;
    let macro = game.macros.find(m => (m.name === test_name) && (m.command === command));
    let macro_spec = { name: test_name, type: "script", command: command, flags: { "sagamachine.sm_test_macro": true }};
    if (skill) macro_spec['img'] = skill.img;
    if (!macro) macro = await Macro.create(macro_spec);

    // Assign to the hotbar
    game.user.assignHotbarMacro(macro, slot);
    return false;
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {string} itemName
 * @return {Promise}
 */
export async function sm_test_macro(dataset) {
    // Get the actor if none is specified in the data
    if (!dataset['actorId']) {
        const speaker = ChatMessage.getSpeaker();
        let actor = null;
        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);
        dataset['actorId'] = actor.id
    }

    await test_dialog(dataset);
}

/**
 * Show a roll dialog for the test provided in the dataset
 *
 * @param dataset
 * @returns {Promise<void>}
 * @private
 */
export async function test_dialog(dataset) {
    const actor = game.actors.get(dataset['actorId']);
    const dialog_content = await renderTemplate("systems/saga-machine/templates/roll-dialog.html", {...actor.sheet.getData(), ...dataset});
    new Dialog({
        title: "Make Test",
        content: dialog_content,
        buttons: {
            roll: {
                label: "Make Test",
                callback: async (html) => {
                    let stat = html.find('select[name=stat] > option:selected').data('val');
                    let score = html.find('select[name=score] > option:selected').data('val');
                    let skill = html.find('select[name=skill] > option:selected').data('val');
                    const modifier = html.find('input[name=modifier]').val();
                    const boons = html.find('input[name=boons]').val();
                    const banes = html.find('input[name=banes]').val();
                    const tn = html.find('input[name=tn]').val();
                    const damage = html.find('input[name=damage]').val();
                    const stat_label = html.find('select[name=stat]').val() || html.find('select[name=score]').val();

                    const label = test_syntax(stat_label, html.find('select[name=skill]').val(), tn, true);
                    const dice = dice_roll(boons, banes);
                    let roll = await new Roll(dice, actor.system);
                    let results = await roll.evaluate();
                    let pairs = make_pairs(results, boons, banes);
                    [stat, score, skill] = apply_unskilled(stat, score, skill);
                    let total = pairs.total + stat || score + skill + modifier;
                    if (stat_label === 'defense' || stat_label === 'willpower') update_defense(actor, pairs.total);
                    const margin = calc_margin(lookup_tn(tn), total, damage);
                    const pairs_message = pairs.pairs ? `<br><strong>Pair of ${pairs.pairs}'s!</strong>` : '';
                    let message = await results.toMessage({
                        speaker: ChatMessage.getSpeaker({ actor: actor }),
                        flavor: label
                    }, {create: false});
                    message.content = `
                        <div class="dice-roll">
                            <div class="dice-result">
                                <div class="dice-formula">
                                    ${results.formula} + <span title="Stat">${stat || score}</span> + <span title="Skill">${skill}</span> + <span title="Modifier">${modifier}</span> 
                                    ${pairs_message}
                                </div>
                                <div class="dice-tooltip">
                                    <section class="tooltip-part">
                                        <div class="dice">
                                            <header class="part-header flexrow">
                                                <span class="part-formula">${results.formula}</span>
            
                                                <span class="part-total">${results.total}</span>
                                            </header>
                                            ${pairs.html}
                                        </div>
                                    </section>
                                </div>
                                <h4 class="dice-total">${total} ${margin.message}</h4>
                            </div>
                        </div>`;

                    ChatMessage.create(message);

                },
                icon: `<i class="fas fa-check"></i>`
            }
        },
        default: "roll"
    }).render(true, {width: 450});
}

/**
 * Generate the Saga Machine label for the test
 *
 * @param stat
 * @param skill
 * @param tn
 * @param append_test
 * @returns {*}
 * @private
 */
function test_syntax(stat, skill, tn, append_test=true) {
	const stat_label = stat ? capitalize(stat) : '1d10';
	const skill_label = skill ? `/${skill}` : '';
	const tn_label = tn ? (isNaN(tn) ? ` vs. ${tn}` : `-${tn}`) : '';
	return stat_label + skill_label + tn_label + (append_test ? ' Test' : '');
}

/**
 * Capitalize the first letter of the string
 *
 * @param word
 * @returns {string}
 * @private
 */
function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Generate the roll string for the test, canceling out boons and banes
 *
 * @param boons
 * @param banes
 * @returns {string}
 * @private
 */
function dice_roll(boons, banes) {
	// Correct for blank and undefined values
	if (!boons) boons = 0;
	if (!banes) banes = 0;

	const total = boons - banes;
	if (total === 0) return '1d10';
	else if (total > 0) return `${total+1}d10kh1`;
	else return `${total*-1+1}d10kl1`;
}

/**
 * Take the roll results and look for pairs, adding them appropriately if there were boons
 *
 * @param results
 * @param boons
 * @param banes
 * @returns {{total: *, html: string, pairs: boolean}}
 * @private
 */
function make_pairs(results, boons, banes) {
	let pairs = false;
	if (boons > banes) {
		// Find the highest pair
		const found = [];
		let highest_pair = 0;
		for (let i of results.dice[0].results) {
			if (found.includes(i.result) && i.result > highest_pair) highest_pair = i.result;
			found.push(i.result);
		}

		// Set the total and discards
		if (highest_pair * 2 > results.total) {
			pairs = highest_pair;
			results._total = highest_pair * 2;
			let active = 0;
			for (let i of results.dice[0].results) {
				if (i.result === highest_pair && active < 2) {
					i.discarded = false;
					active++;
				}
				else i.discarded = true;
			}
		}
	}

	return {
		total: results.total,
		pairs: pairs,
		html: dice_html(results.dice[0].results)
	}
}

/**
 * Generate the expanded roll for the test, to be output as a card in chat
 *
 * @param results
 * @returns {string}
 * @private
 */
function dice_html(results) {
	let to_return = '<ol class="dice-rolls">';
	for (let i of results) {
		const discarded = i.discarded ? 'discarded' : '';
		to_return += `<li class="roll die d10 ${discarded}">${i.result}</li>`;
	}

	to_return += '</ol>';
	return to_return;
}

/**
 * If skill is 0 or '0' halve the applicable stat or score
 *
 * @param stat
 * @param score
 * @param skill
 */
function apply_unskilled(stat, score, skill) {
	return skill == 0 ?
		[Math.floor(Number(stat) / 2), Math.floor(Number(score) / 2), 0] :
		[Number(stat), Number(score), Number(skill)];
}

/**
 * Upddate the actor's Defense and Willpower TNs after a Defense roll
 *
 * @param die
 * @private
 */
function update_defense(actor, die) {
	actor.update({'system.scores.defense.tn': actor.data.system.scores.defense.value + die});
	actor.update({'system.scores.willpower.tn': actor.data.system.scores.willpower.value + die});
}

/**
 * Calculate the margin of success or failure from the TN and total, also calculate damage if necessary
 *
 * @param tn
 * @param total
 * @param raw_damage
 * @returns {{damage: null, margin: number, critical: boolean, success: boolean, message: string}|{message: string}}
 * @private
 */
function calc_margin(tn, total, raw_damage) {
    // Handle unknown TN
    if (!tn) return {
        message: ''
    };

    let margin = total - tn;
    const success = margin >= 0;
    margin = Math.abs(margin);
    const critical = margin >= tn || total < tn/2;

    let damage = null;
    let success_message = 'Success';
    let failure_message = 'Failure';
    let extra_message = `Margin ${margin}`;
    if (success && raw_damage) {
        damage = calc_damage(margin, raw_damage);
        success_message = 'Hit';
        failure_message = 'Miss';
        extra_message = `Damage ${damage}`;
    }

    const message = `<div><small>${critical ? 'Critical ' : ''}${success ? success_message : failure_message}! ${extra_message}</small></div>`;
    return {
        success: success,
        critical: critical,
        margin: margin,
        damage: damage,
        message: message
    };
}

/**
 * Calculate damage from the margin and damage string
 *
 * @param margin
 * @param damage_str
 * @returns {*}
 * @private
 */
function calc_damage(margin, damage_str) {
	const damage = Function(`'use strict'; return (${damage_str})`)();
	return margin + damage;
}

/**
 * Look up the Defense or Willpower TN of the targeted token
 *
 * @param raw_tn
 * @returns {boolean|number|*}
 * @private
 */
function lookup_tn(raw_tn) {
	if (!isNaN(raw_tn)) return Number(raw_tn);

	const is_defense = raw_tn.toLowerCase() === 'defense';
	const is_willpower = raw_tn.toLowerCase() === 'willpower';
	if (!is_defense && !is_willpower) return false;

	const scores = game?.user?.targets?.values()?.next()?.value?.actor?.system?.scores;
	if (!scores) return false;
	return is_defense ? scores.defense.tn : scores.willpower.tn;
}
