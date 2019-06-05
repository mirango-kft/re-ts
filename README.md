# re-ts

A redux helper library for TypeScript. Historically using TypeScript with redux resulted in a lot of boilerplate code. With the most recent additions to the language it is now possible to write convenient helper functions that generate type-safe action creators, action types and reducers.

## Install

```
yarn add --dev @mirango/re-ts
```

## Example

```ts
import { CreateActionType, createActions, makeReducer } from ".";

// Use the createActions helper function to define your actions and action types at the same time
export const [actions, actionTypes] = createActions(action => ({
  increment: action("counter/increment", (value: number) => ({ value })),
  decrement: action("counter/decrement", (value: number) => ({ value })),
  reset: action("counter/reset")
}));

// You can use the CreateActionType helper to define your action type
type TodoAction = CreateActionType<typeof actions>;

// Defining the reducer
const initialState = {
  counter: 0
};

// Create your reducer by specifying:
// - the action type(s) it can handle as the type parameter
// - the initial state
// - and the handler functions for the handled action types
export const reducer = makeReducer<TodoAction>()(initialState, {
  [actionTypes.increment]: (state, { value }) => {
    state.counter += value;
  },
  [actionTypes.decrement]: (state, { value }) => {
    state.counter -= value;
  },
  [actionTypes.reset]: state => {
    state.counter = 0;
  }
});
```
