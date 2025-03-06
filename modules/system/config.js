// Config objects for the system settings

/**
 * The starting number of experiences player characters should have, including stat costs
 *
 * @type SettingConfig
 */
export const level_config = {
    name: 'Starting Power Level',
    hint: 'The starting power level of all player characters.',
    scope: 'world',
    config: true,
    type: Number,
    default: 120,
    choices: {
        85: "Mundane",
        120: "Novice",
        160: "Exceptional",
        200: "Distinguished",
        240: "Renowned",
        280: "Legendary",
        150: "Shadows Over Sol"
    }
}

/**
 * The label to use for Luck in this setting
 *
 * @type SettingConfig
 */
export const luck_label_config = {
    name: 'Name for Luck',
    hint: 'Luck, Edge, Karma, Moxie, etc.',
    scope: 'world',
    config: true,
    type: String,
    default: 'Luck',
    choices: {
        "Luck": "Luck",
        "Edge": "Edge",
        "Karma": "Karma",
        "Moxie": "Moxie"
    }
}

/**
 * Whether a character's starting Luck should affect their experience total (e.g. for Shadows Over Sol)
 *
 * @type SettingConfig
 */
export const luck_exp_config = {
    name: 'Starting Luck Affects Experience',
    hint: 'Used in Shadows Over Sol',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
}

/**
 * Whether the campaign uses the optional Stress and Mental Break rules
 *
 * @type SettingConfig
 */
export const stress_config = {
    name: 'Use Stress & Mental Breaks',
    hint: 'This campaign uses the optional Stress rules.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
}