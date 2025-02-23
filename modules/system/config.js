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
        280: "Legendary"
    }
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