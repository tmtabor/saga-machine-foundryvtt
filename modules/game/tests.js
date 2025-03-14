import Tagify from "../libraries/tagify.min.js";
import { capitalize, system_setting, test_label, token_actor } from "../system/utils.js";
import { ModifierSet } from "./modifiers.js";
import { Effect } from "./damage.js";
import { ActionHelper } from "../item/item.js";
import { CharacterHelper } from "../actor/actor.js";

/**
 * Register Handlebars helpers for test dialog
 */
Hooks.once("init", async () => {
    // Register handlebars helpers
    Handlebars.registerHelper("skillSelect", (selected, options) => {
        const escapedValue = RegExp.escape(Handlebars.escapeExpression(selected));
        const rgx = new RegExp(` value=[\"']${escapedValue}[\"\']`);
        const html = options.fn(this);
        return html.replace(rgx, "$& selected");
    });
});

/**
 * The following constants were moved from the templates to code due to deprecations in Foundry 12
 */

/**
 * Used to build the stat dropdown in the test dialog
 */
export const STAT_OPTIONS = {
    '': '--',
    'strength': 'Strength',
    'dexterity': 'Dexterity',
    'speed': 'Speed',
    'endurance': 'Endurance',
    'intelligence': 'Intelligence',
    'perception': 'Perception',
    'charisma': 'Charisma',
    'determination': 'Determination'
};

export const SCORE_OPTIONS = {
    '': '--',
    'defense': 'Defense',
    'willpower': 'Willpower'
};


export const VEHICLE_SCORE_OPTIONS = {
    '': '--',
    'defense': 'Defense',
    'crew': 'Crew'
};

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
    stressed = 0;
    panic = false;

    /**
     * Initialize test from a dataset and validate
     *
     * @param dataset
     */
    constructor(dataset) {
        Object.assign(this, dataset);
        this.validate();
    }

    /**
     * Ensure that the test has all the critical properties necessary to evaluate it
     */
    validate() {
        // Make sure the dataset has all the required components, throw an error if not
        let valid = (this.sceneId && this.tokenId || this.actorId || this.actor) && this.actor && this.actor.system &&
            ((this.actor.system?.stats && this.actor.system?.stats[this.stat]) ||
             (this.actor.system?.scores && this.actor.system?.scores[this.stat]) || !this.stat);
        if (!valid)
            throw `Test missing required data: scene=${this.sceneId}, token=${this.tokenId}, actor=${this.actorId}, stat=${this.stat}`;

        // Ensure that numeric parts of the dataset are represented as numbers
        if (this.tn && !isNaN(this.tn)) this.tn = Number(this.tn);
        if (this.boons && !isNaN(this.boons)) this.boons = Number(this.boons); else this.boons = 0;
        if (this.banes && !isNaN(this.banes)) this.banes = Number(this.banes); else this.banes = 0;
        if (this.modifier && !isNaN(this.modifier)) this.modifier = Number(this.modifier); else this.modifier = 0;
        if (this.stress_boons && !isNaN(this.stress_boons)) this.stress_boons = Number(this.stress_boons); else this.stress_boons = 0;

        // Parse the effects, if any
        if (this.effects) {
            // If the effects are already parsed, return
            if (Array.isArray(this.effects) && this.effects.every(c => c instanceof Effect))
                return;

            // Otherwise, parse them if a string
            let effects_list = null;
            if (typeof this.effects === 'string') effects_list = JSON.parse(this.effects);
            else effects_list = this.effects;

            // And transform the into effect objects
            if (!Array.isArray(effects_list)) effects_list = [effects_list];
            for (let i = 0; i < effects_list.length; i++)
                effects_list[i] = new Effect(effects_list[i], this);
            this.effects = effects_list;
        }
    }

    /**
     * Set the actor making the test
     *
     * @param {SagaMachineActor} actor
     */
    set actor(actor) {
        this._actor = actor;
    }

    /**
     * Get the actor making the test, returning null if not specified
     *
     * @return {SagaMachineActor|null}
     */
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
        this._label = test_label(this.stat, this.skill, this.tn);
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
        else if (total > 0) return `${total + 1}d10kh1`;
        else return `${total * -1 + 1}d10kl1`;
    }

    /**
     * Take the roll results and look for pairs, adding them appropriately if there were boons
     *
     * @returns {[number, boolean]} - the individual value of the highest pair, whether a pair should be used
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
                } else i.discarded = true;
            }
        }

        return [highest_pair, use_pair];
    }

    /**
     * Look up the rank of the skill specified in the test
     *
     * @return {number}
     */
    lookup_skill() {
        // Separate skill name from specialization
        let specialization = this.skill.match(/\(([^\)]+)\)/);
        if (specialization) specialization = specialization[specialization.length - 1];
        let skill = specialization ? this.skill.split(' ')[0] : this.skill;

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

        // If there are no matching skills, try searching by full name
        if (!matching_skills.length) {
            matching_skills = this.actor.items.filter(item => item.type === 'skill' && item.name === this.skill);
        }

        // If there are still no matching skills, return 0
        if (!matching_skills.length) return 0;

        // Otherwise, look up the rank and return
        else return Number(matching_skills[0].system.rank);
    }

    /**
     * Calculate the total of the test
     *
     * @returns {[number, number, number, number]} - total, randomizer, stat, skill values
     */
    calc_total() {
        // Look up the stat or score value
        let stat = this.stat ? (this.stat in (this.actor.system?.stats || []) ?
            this.actor.system?.stats[this.stat].value : this.actor.system?.scores[this.stat].value) : 0;

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
     * If Stress is being used, check for Panic
     */
    check_stress() {
        // If using Stress
        if (system_setting('stress', false)) {
            // Get the Stressed value
            const stressed = CharacterHelper.stress(this.actor) || 0;

            // Get the Stress dice
            const stress_dice = this.stress_boons ? this.results.dice[0].results.slice(this.stress_boons * -1): [];

            // Check for Panic
            let panic = false;
            for (let i of stress_dice)
                if (i.result <= stressed) panic = true;

            return [stressed, panic];
        }
        // Not using stress, no panic
        else return [0, false];
    }

    /**
     * Look up the Defense or Willpower TN of the targeted token
     *
     * @returns {[number, SagaMachineActor|null, string|number]} - TN value, target actor, TN string (defense, willpower)
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
        let one_count = 0;
        for (let i of this.results.dice[0].results)
            if (i.result === 1) one_count++;
        return one_count >= 2;
    }

    /**
     * Calculate the margin of success or failure from the TN and total
     *
     * @returns {[boolean, boolean, number]} -  is success?, is critical?, margin
     */
    calc_margin() {
        // Handle unknown TN
        if (!this.tn) return [null, null, null];

        // Calculate margin, success and criticals
        let margin = Math.abs(this.total - this.tn);
        let success = this.total >= this.tn;
        let critical = margin >= this.tn || this.total < this.tn / 2;

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
     * @returns {Test}
     */
    async evaluate() {
        // Perform the roll and get the results
        const roll_str = this.roll_syntax();
        const roll = new Roll(roll_str);
        this.results = await roll.evaluate();

        // Make pairs and calculate the total
        [this.pairs, this.use_pair] = this.make_pairs();
        [this.total, this.randomizer, this.stat_value, this.skill_value] = this.calc_total();
        [this.stressed, this.panic] = this.check_stress();

        // Determine success, critical and calculate the margin
        [this.tn, this.target, this.target_score] = this.lookup_tn();
        [this.success, this.critical, this.margin] = this.calc_margin();

        // Mark as evaluated and return
        this.evaluated = true;
        return this;
    }

    /**
     * Apply the effects of the action, depending on success or failure
     *
     * @param dataset
     * @return {Promise<void>}
     */
    async apply_effects(dataset) {
        if (!this.effects) this.effects = []; // Init effects, if needed
        const properties = dataset?.properties || this.properties || [];
        if (!this.effects_evaluated) {
            // Handle extra hits and shots from the Auto property
            if (ActionHelper.has_property(properties, 'Auto')) {
                const base_attack = this.basic_attack_damage() || {value: 0, damage_type: 'sm'};
                for (let m_count = this.margin - 5; m_count > 0; m_count -= 5)
                    this.effects.push(new Effect({
                        type: 'damage',
                        value: base_attack.value,
                        damage_type: base_attack.damage_type,
                        margin: m_count,
                        when: 'success',
                        target: 'target',
                        properties: properties
                    }, this));
                this.effects.push(new Effect({
                    type: 'message',
                    key: 'Ammo',
                    value: `Automatic fire consumes ${ActionHelper.property_value(properties, 'Auto')} shots.`
                }, this));
            }

            // Handle the Stun property
            if (ActionHelper.has_property(properties, 'Stun'))
                this.effects.push(new Effect({
                    type: 'consequence',
                    name: 'Stunned',
                    when: 'success',
                    target: 'target'
                }, this));

            const ordering = ['defense', 'damage', 'consequence', 'message'];
            this.effects.sort((a, b) => {
                if (ordering.indexOf(a.type) > ordering.indexOf(b.type)) return 1;
                if (ordering.indexOf(a.type) < ordering.indexOf(b.type)) return -1;
                if (ordering.indexOf(a.type) === ordering.indexOf(b.type)) return 0;
            });
            this.effects_evaluated = true;
        }

        // Apply effects
        const when = this.success ? 'success' : (this.tn ? 'failure' : 'always');
        for (let c of this.effects) c.apply(when, dataset);
    }

    /**
     * Get the test's first 'damage' type Effect object, return null is no matches
     *
     * @return {Effect|null}
     */
    basic_attack_damage() {
        const damage_effects = this.effects.filter(c => c.type === 'damage');
        if (damage_effects.length) return damage_effects[0];
        else return null;
    }

    /**
     * Return the "flavor" portion of the test's chat card
     *
     * @return {string}
     */
    flavor() {
        // Create target and result messages
        const target_message = this.target ?
            `<div><strong>Target:</strong> ${this.target.name} (${capitalize(this.target_score)} ${this.tn})</div>` : '';
        const success_message = (this.critical ? 'Critical ' : '') +
            (this.target_score ? (this.success ? 'Hit!' : 'Miss!') : (this.success ? 'Success!' : 'Failure!'));
        const success_class = (this.critical ? 'critical ' : '') + (this.success ? 'success' : 'failure');
        const result_message = this.tn ?
            `<div><strong>Result:</strong> <span class="${success_class}">${success_message}</span> Margin ${this.margin}</div>` : '';

        // Create the effect message, if any
        let effect_message = '';
        if (this.panic) effect_message += '<div><strong>Panic:</strong> <span class="panic">Make a Panic test!</span></div>';
        if (this.effects)
            for (let c of this.effects)
                effect_message += c.message;

        // Get the label for Luck
        const luck_label = system_setting('luck_label', 'Luck');

        // Create the tags
        let tags = '';
        if (!!this.stat) tags += `<span class="tag">${capitalize(this.stat)} +${this.stat_value}</span>`;
        if (!!this.skill && this.skill !== 'Unskilled') tags += `<span class="tag">${this.skill} +${this.skill_value}</span>`;
        if (this.skill && this.skill_value === 0) tags += '<span class="tag">Unskilled</span>';
        if (!!this.tags && this.tags.length) this.tags.forEach(t => tags += `<span class="tag">${t}</span>`);
        if (this.use_pair) tags += '<span class="tag">Pairs!</span>';
        if (this.use_luck) tags += `<span class="tag">${luck_label}</span>`;
        if (this.edited) tags += '<span class="tag">Edited</span>';

        // Return the result
        return `<h4 class="action">${this.label}</h4>
                ${target_message} 
                ${result_message} 
                ${effect_message}
                <hr />
                <div class="tags">${tags}</div>`;
    }

    /**
     * Generate the expanded roll for the test, to be output as a card in chat
     *
     * @returns {string}
     */
    dice_html() {
        const use_stress = system_setting('stress', false);
        let to_return = '<ol class="dice-rolls">';
        for (let i = 0; i < this.results.dice[0].results.length; i++) {
            const die = this.results.dice[0].results[i];
            const discarded = die.discarded ? 'discarded' : '';

            let stress = use_stress && i >= this.results.dice[0].results.length - this.stress_boons ? 'stress' : '';
            if (use_stress && die.result <= this.stressed) stress += ' panic';

            to_return += `<li class="roll die d10 ${discarded} ${stress}">${die.result}</li>`;
        }

        to_return += '</ol>';
        return to_return;
    }

    /**
     * Return the "content" portion of the test's chat card
     *
     * @return {string}
     */
    content() {
        const stat_span = this.stat_value ? `+ <span title="Stat">${this.stat_value}</span>` : '';
        const skill_span = this.skill_value ? `+ <span title="Skill">${this.skill_value}</span>` : '';
        const modifier_span = this.modifier ? `+ <span title="Modifier">${this.modifier}</span>` : '';
        const test_json = JSON.stringify(Test.to_json(this));

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
            </div>
            <input type="hidden" class="test-json" value='${test_json}' />`;
    }

    /**
     * Send the test to chat
     *
     * @param {boolean} whisper
     * @param {Roll[]|null} rolls
     * @return {Promise<void>}
     */
    async to_chat({whisper = false, rolls = null}) {
        if (rolls) {
            if (!Array.isArray(rolls)) rolls = [rolls];                 // Ensure this is an array
            rolls = rolls.map(r => JSON.stringify(r.toJSON()));     // Convert to what ChatMessage expects
        }

        // Send the message to chat
        await ChatMessage.create({
            content: this.content(),
            flavor: this.flavor(),
            rolls: rolls ? rolls : (whisper ? [] : [this.results]),  // Foundry 12: Setting rolls may interfere with whisper functionality
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            whisper: whisper ? game.users.filter(u => u.isGM || u.character?.id === this.actor?.id ).map(u => u.id) : []
        });
    }

    /**
     * Create a json representation of the specified test
     *
     * @param test
     * @return {*}
     */
    static to_json(test) {
        const json = {};
        for (let [key, value] of Object.entries(test)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null)
                json[key] = value;

            // Special handling for _actor and target
            else if (key === '_actor' || key === 'target') {
                json[key] = { uuid: value.uuid };
            }

            // Special handling for effects
            else if (key === 'effects') {
                const effect_json = [];
                for (let con of test.effects)
                    effect_json.push(Effect.to_json(con));
                json[key] = effect_json;
            }

            // Special handling for results
            else if (key === 'results')
                json[key] = {
                    _evaluated: value._evaluated,
                    _formula: value._formula,
                    _total: value._total,
                    _terms: value.terms[0].results
                };
        }

        return json;
    }

    /**
     * Create a Test object from the given json representation
     *
     * @param obj
     * @return {Test}
     */
    static from_json(obj) {
        const dataset = {};
        for (let [key, value] of Object.entries(obj)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null)
                dataset[key] = obj[key]

            // Special handling for _actor and target
            else if (key === '_actor' || key === 'target') {
                if (value instanceof game.sagamachine.SagaMachineActor) dataset[key] = value;
                else dataset[key] = token_actor(value);
            }

            // Special handling for effects
            else if (key === 'effects') dataset[key] = value;

            // Special handling for results
            else if (key === 'results') {
                dataset[key] = new Roll(value._formula);
                dataset[key]._evaluated = value._evaluated;
                dataset[key]._formula = value._formula;
                dataset[key]._total = value._total;
                dataset[key].terms = [new foundry.dice.terms.Die({faces: 10})];
                dataset[key].terms[0].results = value._terms;
            }
        }

        return new Test(dataset);
    }
}

/**
 * Show a test dialog for the test provided in the dataset
 *
 * @param dataset - Dataset with test parameters
 * @param callback - Optional callback to be executed when test is resolved, passes Test object as parameter
 * @return {Promise<void>}
 */
export async function test_dialog(dataset, callback=null) {
    const actor = token_actor(dataset);
    const score_options = actor.type === 'vehicle' ? VEHICLE_SCORE_OPTIONS : SCORE_OPTIONS;

    const dialog_content = await renderTemplate("systems/saga-machine/templates/apps/test-dialog.html",
        {actor: { ...actor.sheet.getData().data }, STAT_OPTIONS: STAT_OPTIONS, SCORE_OPTIONS: score_options, ...dataset});

    new Dialog({
        title: "Make Test",
        content: dialog_content,
        render: html => {
            // Initialize the modifiers (tag) widget
            const modifiers = actor.modifiers(dataset);     // Get the list of modifiers from consequences
            const modifier_input = html.find('input[name=modifiers]');   // Get the modifiers input DOM element
            if (!modifier_input) return;
            const modifier_tagify = new Tagify(modifier_input[0], {
                duplicates: true,
                transformTag: tag_data => {
                    tag_data.style = ModifierSet.color(tag_data.value);
                    if (isNaN(parseInt(tag_data.value.split(" ").at(-1))))
                        tag_data.value = tag_data.value.replaceAll('+', '⊕').replaceAll('-', '⊖');
                }
            });
            const initial_tags = foundry.utils.deepClone(modifier_tagify.value);
            const generated_tags = modifiers.map(m => m.tag());
            modifier_tagify.addTags(generated_tags); // Add modifiers from consequences

            // Tagify the properties
            const property_input = html.find('input[name=properties]');   // Get the properties input DOM element
            const property_tagify = new Tagify(property_input[0], {
                duplicates: true,
                transformTag: tag_data => {
                    tag_data.style = ModifierSet.GRAY;
                }
            });

            // Redo modifiers when the stat, score, TN or properties is changed
            const inputs = html.find('select[name=stat], select[name=score], select[name=skill], input[name=tn], input[name=properties]');
            inputs.on('change', event => {
                // Get the new test parameters
                const modified_dataset = JSON.parse(JSON.stringify(dataset)); // Clone the dataset because deepCopy isn't working
                modified_dataset.stat = html.find('select[name=stat]').val();
                modified_dataset.score = html.find('select[name=score]').val();
                modified_dataset.skill = html.find('select[name=skill]').val();
                modified_dataset.tn = html.find('input[name=tn]').val();

                // Parse Tagify JSON and put it in the expected format
                const prop_json = html.find('input[name=properties]').val() || "[]";
                modified_dataset.properties = JSON.parse(prop_json).map(p => p.value).join(',');

                // Get the new modifiers and set the tag widget
                const new_modifiers = actor.modifiers(modified_dataset);
                modifier_tagify.removeAllTags();
                modifier_tagify.addTags(initial_tags);
                modifier_tagify.addTags(new_modifiers.map(m => m.tag()));
            });
        },
        buttons: {
            roll: {
                label: "Make Test",
                callback: async (html) => {
                    html.find('select[name=stat] > option:selected').trigger('focus');
                    setTimeout(async () => { // Wait for unfocus event on modifier widget
                        // Gather form data
                        let stat = html.find('select[name=stat] > option:selected').val();
                        let score = html.find('select[name=score] > option:selected').val();
                        let skill = html.find('select[name=skill] > option:selected').val();
                        const { boons, banes, modifier, tags, stress_boons } = ModifierSet.total_modifiers(
                            ModifierSet.list_from_string(html.find('input[name=modifiers]').val())
                        );
                        const tn = html.find('input[name=tn]').val();
                        const effects = html.find('input[name=effects]').val();

                        // Create and evaluate the test
                        const test = new Test({
                            actor: actor,
                            stat: stat || score,
                            skill: skill || null,
                            boons: boons || 0,
                            banes: banes || 0,
                            modifier: modifier || 0,
                            stress_boons: stress_boons || 0,
                            tags: tags,
                            tn: tn || null,
                            effects: effects || null
                        });
                        await test.evaluate();

                        // Apply any immediate test effects
                        await test.apply_effects(dataset);

                        // Send the message to chat
                        const whisper = !!dataset['whisper'];
                        await test.to_chat({whisper: whisper});

                        // Make the callback, if provided
                        if (callback) await callback(test);
                    }, 200);
                },
                icon: `<i class="fas fa-check"></i>`
            }
        },
        default: "roll"
    }).render(true, { width: 450 });
}
