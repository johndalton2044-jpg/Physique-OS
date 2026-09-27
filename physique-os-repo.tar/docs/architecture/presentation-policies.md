# Presentation policies

These were declared as objects in code but never read by anything. They record decisions the app does follow, so they are kept here as documentation rather than as code that looks consumed. Moved out of the source in H0 (registry classification).

## THREE_D_POLICY

```json
{
  "renderer": "none",
  "articulation": "not modelled — joint angles are declared per movement pattern, not computed from a skeleton",
  "why": "a rotatable body model implies measurement precision this record does not have. Nothing here observes a joint angle; a 3D figure would be an illustration presented as data.",
  "ifEverBuilt": "it would need measured joint angles from video or sensors, and it would be labelled PRIOR until it had them"
}
```

## MOVEMENT_VISUAL

```json
{
  "vector": {
    "use": "the direction force is applied",
    "source": "declared per movement pattern"
  },
  "angles": {
    "use": "joint positions through a range",
    "source": "declared, not measured",
    "caution": "these are the pattern’s nominal angles, not yours"
  },
  "anatomical": {
    "use": "which structures the pattern loads",
    "source": "the exercise ontology"
  },
  "path": {
    "use": "the bar or limb path",
    "source": "not tracked — nothing here observes it"
  }
}
```

## IMAGE_POLICY

```json
{
  "avatar": {
    "source": "user photo only",
    "privacy": "never leaves the device",
    "fallback": "initials"
  },
  "thumbnail": {
    "maxEdge": 320,
    "format": "whatever the camera produced",
    "note": "generated on device"
  },
  "illustration": {
    "policy": "none shipped",
    "why": "illustration in a measurement app decorates a claim it cannot support"
  },
  "background": {
    "policy": "none",
    "why": "a background image costs contrast and buys nothing here"
  },
  "imagery": {
    "policy": "user content only"
  }
}
```

## ANIMATION_POLICY

```json
{
  "duration": {
    "instant": 0,
    "fast": 120,
    "normal": 200,
    "slow": 320
  },
  "easing": {
    "standard": "cubic-bezier(.2,.0,.2,1)",
    "enter": "cubic-bezier(.0,0,.2,1)",
    "exit": "cubic-bezier(.4,0,1,1)",
    "emphasis": "cubic-bezier(.2,.8,.2,1)"
  },
  "categories": [
    "navigation",
    "stateTransition",
    "dataUpdate",
    "chartReveal",
    "interactionFeedback",
    "loading",
    "success",
    "error",
    "attention"
  ]
}
```

## NUMERIC_TYPOGRAPHY

```json
{
  "tabular": "tnum",
  "proportional": "pnum",
  "decimalAlign": true,
  "signAlign": true,
  "unitAlign": true,
  "compact": true,
  "scientific": true,
  "localized": true
}
```
