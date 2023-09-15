import {capitalize, token_actor} from "./utils.js";

/**
 * Object representing a Saga Machine test
 */
export class Test {
    _actor = null;
    _label = null;

    target = null;
    target_score = null;
    critical = false;
    evaluated = false;
    margin = null;
    pairs = null;
    results = null;
    skill_value = 0;
    stat_value = 0;
    success = false;
    randomizer = null;
    total = null;
    use_pair = false;

    /**
     * Initialize from a dataset
     * @param dataset
     */
    constructor(dataset) {
        Object.assign(this, dataset);
        this.validate();
    }

    validate() {
        // Make sure the dataset has all the required components, throw an error if not
        let valid = (this.sceneId && this.tokenId || this.actorId || this.actor) && this.actor && this.actor.system &&
            (this.actor.system.stats[this.stat] || this.actor.system.scores[this.stat] || !this.stat);
        if (!valid)
            throw `Test missing required data: scene=${this.sceneId}, token=${this.tokenId}, actor=${this.actorId}, stat=${this.stat}`;

        // Ensure that numeric parts of the dataset are represented as numbers
        if (this.tn && !isNaN(this.tn)) this.tn = Number(this.tn);
        if (this.boons && !isNaN(this.boons)) this.boons = Number(this.boons); else this.boons = 0;
        if (this.banes && !isNaN(this.banes)) this.banes = Number(this.banes); else this.banes = 0;
        if (this.modifier && !isNaN(this.modifier)) this.modifier = Number(this.modifier); else this.modifier = 0;

        // Parse the consequences, if any
        if (this.consequences) {
            let consequence_list = JSON.parse(this.consequences);
            if (!Array.isArray(consequence_list)) consequence_list = [consequence_list];
            for (let i = 0; i < consequence_list.length; i++)
                consequence_list[i] = new Consequence(consequence_list[i], this);
            this.consequences = consequence_list;
        }
    }

    set actor(actor) {
        this._actor = actor;
    }

    get actor() {
        if (this._actor) return this._actor;    // Return the cached actor, if available

        // Get the actor corresponding to the token, if any
        if (this.sceneId && this.tokenId) {
            const scene = game.scenes.get(sceneId);
            if (!scene) return null;
            const token_data = scene.items.get(tokenId);
            if (!token_data) return null;
            const token = new Token(token_data);
            this._actor = token.actor;
            return this._actor;
        }

        // Otherwise, get the canonical actor
        this._actor = game.actors.get(this.actorId) || null
        return this._actor;
    }

    /**
     * Generate the Saga Machine label for the test
     *
     * @returns {string}
     */
    get label() {
        if (this._label) return this._label;

        // Lazily generate the label
        const stat_label = this.stat ? capitalize(this.stat) : '1d10';
        const skill_label = this.skill ? `/${this.skill}` : '';
        const tn_label = this.tn ? (isNaN(this.tn) ? ` vs. ${this.tn}` : `-${this.tn}`) : '';
        this._label = stat_label + skill_label + tn_label;
        return this._label;
    }

    /**
     * Generate the roll string for the test, canceling out boons and banes
     *
     * @returns {string}
     */
    roll_syntax() {
        const total = this.boons - this.banes;
        if (total === 0) return '1d10';
        else if (total > 0) return `${total+1}d10kh1`;
        else return `${total*-1+1}d10kl1`;
    }

    /**
     * Take the roll results and look for pairs, adding them appropriately if there were boons
     *
     * @returns {null|(number|boolean)[]}
     */
    make_pairs() {
        // If there weren't any boons, there are no pairs
        if (this.banes >= this.boons) return [null, false];

        // Find the highest pair
        const found = [];
        let highest_pair = 0;
        for (let i of this.results.dice[0].results) {
            if (found.includes(i.result) && i.result > highest_pair) highest_pair = i.result;
            found.push(i.result);
        }

        // Is the highest pair better than the highest result?
        const use_pair = highest_pair * 2 > this.results.total;

        // Set the total and discards in the roll results
        let pairs = false;
        if (highest_pair * 2 > this.results.total) {
            pairs = highest_pair;
            this.results._total = highest_pair * 2;
            let active = 0;
            for (let i of this.results.dice[0].results) {
                if (i.result === highest_pair && active < 2) {
                    i.discarded = false;
                    active++;
                }
                else i.discarded = true;
            }
        }

        return [highest_pair, use_pair];
    }

    lookup_skill() {
        // Separate skill name from specialization
        let [skill, specialization] = this.skill.split(' ', 2);

        // If no specialization, filter skills
        let matching_skills = [];
        if (!specialization) {
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === skill);
        }

        // Otherwise, clean the specialization then filter
        else {
            specialization = specialization.replace(/[()]/g, '');
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === skill &&
                item.system.specialization === specialization);
        }

        // If there are no matching skills, return 0
        if (!matching_skills.length) return 0;

        // Otherwise, look up the rank and return
        else return Number(matching_skills[0].system.rank);
    }

    /**
     * Calculate the total of the test
     *
     * @returns {(*|number|number)[]}
     */
    calc_total() {
        // Look up the stat or score value
        let stat = this.stat ? (this.stat in this.actor.system.stats ?
            this.actor.system.stats[this.stat].value : this.actor.system.scores[this.stat].value) : 0;

        // Get the skill rank
        const relevant_skill = !!this.skill; // There is a skill for this test
        const skill = relevant_skill && this.skill !== 'Unskilled' ? // If falsy, the actor is unskilled
            this.lookup_skill() : 0;

        // Halve the stat in the case of unskilled tests
        if (relevant_skill && !skill) stat = Math.floor(stat / 2);

        // Which is greater? The highest pair or the highest single die
        const randomizer = this.pairs ?
            (this.pairs * 2 > this.results.total ? this.pairs * 2 : this.results.total) : this.results.total;

        // Return the total
        const total = randomizer + stat + skill + this.modifier;
        return [total, randomizer, stat, skill];
    }

    /**
     * Look up the Defense or Willpower TN of the targeted token
     *
     * @returns {(*|number|(function(): (null|null))|number)[]|boolean|number[]}
     */
    lookup_tn() {
        if (typeof this.tn !== 'string') return [this.tn, null, null];

        const is_defense = this.tn.toLowerCase() === 'defense';
        const is_willpower = this.tn.toLowerCase() === 'willpower';
        if (!is_defense && !is_willpower) return false;

        const actor = game?.user?.targets?.values()?.next()?.value?.actor;
        const scores = actor?.system?.scores;
        if (!scores) return [null, null, null];

        // Set properties and return
        const tn = is_defense ? scores.defense.tn : scores.willpower.tn;
        return [tn, actor, this.tn];
    }

    /**
     * Did the dice turn up double 1's?
     *
     * @returns {boolean}
     */
    double_ones() {
        let one_found = false;
        for (let i of this.results.dice[0].results) {
            if (i.result === 1 && !one_found) return true;
            if (i.result === 1 && !one_found) one_found = true;
        }
        return false;
    }

    /**
     * Calculate the margin of success or failure from the TN and total
     *
     * @returns {(boolean|number)[]}
     */
    calc_margin() {
        // Handle unknown TN
        if (!this.tn) return [null, null, null];

        // Calculate margin, success and criticals
        let margin = Math.abs(this.total - this.tn);
        let success = this.total >= this.tn;
        let critical = margin >= this.tn || this.total < this.tn/2;

        // Also check for double 1's on a bane being a critical failure
        if (this.banes > this.boons && this.double_ones()) {
            if (success) {
                success = false;
                margin = 0;
            }
            critical = true;
        }

        return [success, critical, margin];
    }

    /**
     * Evaluate the test
     *
     * @returns RollResults
     */
    async evaluate() {
        // Perform the roll and get the results
        const roll_str = this.roll_syntax();
        const roll = new Roll(roll_str);
        this.results = await roll.evaluate();

        // Make pairs and calculate the total
        [this.pairs, this.use_pair] = this.make_pairs();
        [this.total, this.randomizer, this.stat_value, this.skill_value] = this.calc_total();

        // Determine success, critical and calculate the margin
        [this.tn, this.target, this.target_score] = this.lookup_tn();
        [this.success, this.critical, this.margin] = this.calc_margin();

        // Mark as evaluated and return
        this.evaluated = true;
        return this;
    }

    async apply_consequences() {
        // If there are no consequences, do nothing
        if (!this.consequences) return;

        const when = this.success ? 'success' : (this.tn ? 'failure' : 'always');
        for (let c of this.consequences) c.apply(when);
    }

    flavor() {
        // Create target and result messages
        const target_message = this.target ?
            `<div><strong>Target:</strong> ${this.target.name} (${capitalize(this.target_score)} ${this.tn})</div>` : '';
        const success_message = (this.critical ? 'Critical ' : '') +
            (this.target_score ? (this.success ? 'Hit!' : 'Miss!') : (this.success ? 'Success!' : 'Failure!'));
        const success_class = (this.critical ? 'critical ' : '') + (this.success ? 'success' : 'failure');
        const result_message = this.tn ?
            `<div><strong>Result:</strong> <span class="${success_class}">${success_message}</span> Margin ${this.margin}</div>` : '';

        // Create the consequence message, if any
        let consequence_message = '';
        if (this.consequences)
            for (let c of this.consequences)
                consequence_message += c.message;

        // Create the tags
        let tags = '';
        if (!!this.stat) tags += `<span class="tag">${capitalize(this.stat)} +${this.stat_value}</span>`;
        if (!!this.skill && this.skill !== 'Unskilled') tags += `<span class="tag">${this.skill} +${this.skill_value}</span>`;
        if (this.skill && this.skill_value === 0) tags += '<span class="tag">Unskilled</span>';
        if (!!this.modifier) tags += `<span class="tag">Modifier ${this.modifier >= 0 ? '+' : ''}${this.modifier}</span>`;
        if (this.use_pair) tags += '<span class="tag">Pairs!</span>';

        // Return the result
        return `<h4 class="action">${this.label}</h4>
                ${target_message} 
                ${result_message} 
                ${consequence_message}
                <hr />
                <div class="tags">${tags}</div>`;
    }

    /**
     * Generate the expanded roll for the test, to be output as a card in chat
     *
     * @returns {string}
     * @private
     */
    dice_html() {
        let to_return = '<ol class="dice-rolls">';
        for (let i of this.results.dice[0].results) {
            const discarded = i.discarded ? 'discarded' : '';
            to_return += `<li class="roll die d10 ${discarded}">${i.result}</li>`;
        }

        to_return += '</ol>';
        return to_return;
    }

    content() {
        const stat_span = this.stat_value ? `+ <span title="Stat">${this.stat_value}</span>` : '';
        const skill_span = this.skill_value ? `+ <span title="Skill">${this.skill_value}</span>` : '';
        const modifier_span = this.modifier ? `+ <span title="Modifier">${this.modifier}</span>` : '';

        return `
            <div class="dice-roll">
                <div class="dice-result">
                    <div class="dice-formula">
                        ${this.results.formula} ${skill_span} ${stat_span} ${modifier_span}
                    </div>
                    <div class="dice-tooltip">
                        <section class="tooltip-part">
                            <div class="dice">
                                <header class="part-header flexrow">
                                    <span class="part-formula">${this.results.formula}</span>
                                    <span class="part-total">${this.results.total}</span>
                                </header>
                                ${this.dice_html()}
                            </div>
                        </section>
                    </div>
                    <h4 class="dice-total">${this.total}</h4>
                </div>
            </div>`;
    }

    async to_chat(whisper=false) {
        // Create the chat message
        const message = await this.results.toMessage({}, {create: false });
        message.flavor = this.flavor();
        message.content = this.content();
        message.speaker = ChatMessage.getSpeaker({ actor: this.actor });

        // Set as a whisper, if requested
        if (whisper) {
            message.type = CONST.CHAT_MESSAGE_TYPES.WHISPER;
            message.whisper = game.users.filter(u => u.isGM).map(u => u.id);
        }

        // Send the message to chat
        ChatMessage.create(message);
    }
}

/**
 * Object representing the consequences of a test
 */
export class Consequence {
    test = null;
    type = null;        // Valid values are 'consequence', 'damage' and 'defense'
    target = 'self';    // Valid values are 'self' and 'target'
    when = 'always';    // Valid values are 'success', 'failure' and 'always'
    message = ''

    constructor(dataset, test=null) {
        Object.assign(this, dataset);   // Assign properties from the dataset
        if (test) this.test = test;     // Assign the test
        this.validate(dataset);         // Validate the dataset
    }

    validate() {
        if (!['consequence', 'damage', 'defense', 'willpower'].includes(this.type))
            throw `Unknown type ${this.type}`;
    }

    right_time(when) {
        return this.when === 'always' || this.when === when;
    }

    format_message(key, value) {
        return `<div><strong>${key}:</strong> ${value}</div>`;
    }

    apply(when='always') {
        if (this.type === 'consequence' && this.right_time(when))    this.apply_consequence();
        if (this.type === 'damage' && this.right_time(when))         this.apply_damage();
        if (this.type === 'defense' && this.right_time(when))        this.apply_defense();
    }

    apply_consequence() {
        // Get the consequence, if it exists as an item
        let consequence = game.items.filter(item => item.type === 'consequence' && item.name === this.name);

        // Attach subject to name if specified
        const clean_name = this.name ? this.name : 'Unknown';
        const full_name = this.subject ? `${clean_name} (${this.subject})` : clean_name;

        // Create the embedded consequence link
        let link = null;
        if (!consequence.length) link = full_name;
        else link = `<a class="content-link" draggable="true" data-uuid="Item.${consequence[0].id}" data-id="${consequence[0].id}" data-type="Item" data-tooltip="Item"><i class="fas fa-suitcase"></i>${full_name}</a>`;

        // Set the message
        this.message = this.format_message('Consequence', link);
    }

    apply_damage() {
        // Calculate the damage
        let damage = Number(this.value);                                // Base damage
        if (this.test && this.test.margin) damage += this.test.margin   // Add the margin
        if (damage < 0) damage = 0;                                     // Minimum 0

        // Get the damage type
        const damage_type = this.damage_type ? this.damage_type : '';

        // Set the message
        this.message = this.format_message('Damage',
            `<span class="damage">${damage}</span> <span class="damage-type">${damage_type}</span>`);
    }

    /**
     * Update the actor's Defense and Willpower TNs after a Defense roll
     */
    apply_defense() {
        if (!this.test) return; // If no test is know, nothing to do now

        // Get the target
        let target = null;
        if (this.target === 'self')                             target = this.test.actor;
        else if (this.target === 'target' && this.test.target)  target = this.test.target;

        // Calculate the TNs
        const defense_tn = target.data.system.scores.defense.value + this.test.randomizer;
        const willpower_tn = target.data.system.scores.willpower.value + this.test.randomizer;

        // Update defense and willpower
        target.update({'system.scores.defense.tn': defense_tn});
        target.update({'system.scores.willpower.tn': willpower_tn});

        // Set the message
        this.message = this.format_message('Defense', `TN ${defense_tn}`) +
            this.format_message('Willpower', `TN ${willpower_tn}`);
    }
}

/**
 * Show a roll dialog for the test provided in the dataset
 *
 * @param dataset
 * @returns {Promise<void>}
 * @private
 */
export async function test_dialog(dataset) {
    const actor = token_actor({
        scene_id: dataset.sceneId,
        token_id: dataset.tokenId,
        actor_id: dataset.actorId
    });

    const dialog_content = await renderTemplate("systems/saga-machine/templates/roll-dialog.html",
        {...actor.sheet.getData(), ...dataset});

    new Dialog({
        title: "Make Test",
        content: dialog_content,
        buttons: {
            roll: {
                label: "Make Test",
                callback: async (html) => {
                    // Gather form data
                    let stat = html.find('select[name=stat] > option:selected').val();
                    let score = html.find('select[name=score] > option:selected').val();
                    let skill = html.find('select[name=skill] > option:selected').val();
                    const modifier = html.find('input[name=modifier]').val();
                    const boons = html.find('input[name=boons]').val();
                    const banes = html.find('input[name=banes]').val();
                    const tn = html.find('input[name=tn]').val();
                    const consequences = html.find('input[name=consequences]').val();

                    // Create and evaluate the test
                    const test = new Test({
                        actor: actor,
                        stat: stat || score,
                        skill: skill || null,
                        boons: boons || 0,
                        banes: banes || 0,
                        modifier: modifier || 0,
                        tn: tn || null,
                        consequences: consequences || null
                    });
                    await test.evaluate();

                    // Apply any immediate test consequences
                    await test.apply_consequences();

                    // Send the message to chat
                    const whisper = !!dataset['whisper'];
                    await test.to_chat(whisper);

                },
                icon: `<i class="fas fa-check"></i>`
            }
        },
        default: "roll"
    }).render(true, {width: 450});
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
export async function create_hotbar_macro(data, slot) {
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
    let macro_spec = { name: label, type: "script", command: command, flags: { "sagamachine.sm_test_macro": true }};
    if (skill) macro_spec['img'] = skill.img;
    if (!macro) macro = await Macro.create(macro_spec);

    // Assign to the hotbar
    game.user.assignHotbarMacro(macro, slot);
    return false;
}

/**
 * Create a Macro from an Item drop. Get an existing item macro if one exists, otherwise create a new one.
 *
 * @param {string} dataset
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

/**
 * Test Drop: Create macro in hotbar
 */
Hooks.once("ready", async function() {
  Hooks.on("hotbarDrop", (bar, data, slot) => create_hotbar_macro(data, slot));
});

/**
 * Drag Chat Card: Attach test data to chat card
 */
Hooks.on("renderChatMessage", async (app, html, msg) => {
    // Get test data
    const damage = html.find('.damage');
    if (!damage.length) return;
    const damage_type = html.find('.damage-type');
    const critical = !!html.find('.critical').length;

    // Attach drag listener
    html[0].setAttribute("draggable", true);	// Add draggable and dragstart listener
    html[0].addEventListener("dragstart", ev => {
        ev.currentTarget.dataset['damage'] = Number(damage.text());
        ev.currentTarget.dataset['damageType'] = damage_type.text();
        ev.currentTarget.dataset['critical'] = critical;
		ev.dataTransfer.setData("text/plain", JSON.stringify(ev.currentTarget.dataset));
    }, false);
});

/**
 * Drop Chat Card: Apply damage to target
 */
Hooks.on("dropActorSheetData", (actor, sheet, data) => {
    if (data['damage']) actor.apply_damage(data['damage'], data['damageType'], data['critical']);
});

/**
 * Chat Card Menu: Add apply damage
 */
Hooks.on("getChatLogEntryContext", (html, options) => {
    options.push({
        name: 'Apply Damage',
        icon: '<i class="fas fa-user-minus"></i>',
        condition: html => !!html.find('.damage').length,
        callback: html => {
            const damage = Number(html.find('.damage').text());
            if (damage) {
                const damage_type = html.find('.damage-type').text();
                const critical = !!html.find('.critical').length;

                // Get the actor controlled by a player, apply the damage and return
                let player_actor = game.user.character;
                if (player_actor) {
                    player_actor.apply_damage(damage, damage_type, critical);
                    return;
                }

                // The GM won't have an actor, instead get all selected tokens
                let tokens = game?.canvas?.tokens?.controlled;

                // If there are no valid tokens, give a warning
                if (!tokens) { ui.notifications.warn("No valid character selected."); return; }

                // Apply damage to all selected token actors
                for (let token of tokens) {
                    let actor = token?.document?.actor;
                    if (actor) actor.apply_damage(damage, damage_type, critical);
                }
            }
        }
    });
});
