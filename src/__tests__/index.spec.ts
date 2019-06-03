import { Actions, action, createActions, makeReducer } from "..";

describe("The action creators", () => {
  it("should create an action without a payload", () => {
    // Act
    const actual = action("action/a");

    // Assert
    expect(actual()).toEqual({ type: "action/a", payload: {} });
  });

  it("should create an action with a simple payload", () => {
    // Act
    const actual = action("action/a", (id: string) => id);

    // Assert
    expect(actual("a")).toEqual({ type: "action/a", payload: "a" });
  });

  it("should create an action with an object as a payload", () => {
    // Act
    const actual = action("action/a", (id: string) => ({ id }));

    // Assert
    expect(actual("a")).toEqual({ type: "action/a", payload: { id: "a" } });
  });

  it("should create an action creator map", () => {
    // Act
    const [actions] = createActions(actionCreator => ({
      a: actionCreator("action/a"),
      b: actionCreator("action/b", (id: string) => id),
      c: actionCreator("action/c", (id: string) => ({ id }))
    }));

    // Assert
    expect(actions.a()).toEqual({ type: "action/a", payload: {} });
    expect(actions.b("b")).toEqual({ type: "action/b", payload: "b" });
    expect(actions.c("c")).toEqual({ type: "action/c", payload: { id: "c" } });
  });
});

describe("The reducer", () => {
  const initialState = { a: 0, b: 0, c: 0 };
  const [actions, actionTypes] = createActions(actionCreator => ({
    a: actionCreator("action/a"),
    b: actionCreator("action/b", (count: number) => ({ count })),
    c: actionCreator("action/c", (x: number, y: number) => ({ x, y }))
  }));
  type TestActions = Actions<typeof actions>;

  it("should initialize the state if it was undefined", () => {
    // Arrange
    const reducer = makeReducer<TestActions>()(initialState, {});

    // Act
    const actual = reducer(undefined, actions.a());

    // Assert
    expect(actual).toBe(initialState);
  });

  it("should not mutate the state", () => {
    // Arrange
    const reducer = makeReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      }
    });

    // Act
    const actual = reducer(undefined, actions.a());

    // Assert
    expect(actual === initialState).toBe(false);
    expect(actual).toEqual({ ...initialState, a: 1 });
  });

  it("should not handle an action if it has no handler defined for it", () => {
    // Arrange
    const reducer = makeReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      }
    });

    // Act
    const temp = reducer(undefined, actions.a());
    const actual = reducer(temp, actions.b(10));

    // Assert
    expect(actual === initialState).toBe(false);
    expect(actual).toBe(temp);
    expect(actual).toEqual({ ...initialState, a: 1 });
  });

  it("should forward action payloads to the reducer functions", () => {
    // Arrange
    const reducer = makeReducer<TestActions>()(initialState, {
      [actionTypes.b]: (state, { count }) => {
        state.b += count;
      }
    });

    // Act
    const actual = reducer(undefined, actions.b(10));

    // Assert
    expect(actual === initialState).toBe(false);
    expect(actual).toEqual({ ...initialState, b: 10 });
  });

  it("should handle actions dispatched in sequence", () => {
    // Arrange
    const reducer = makeReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      },
      [actionTypes.b]: (state, { count }) => {
        state.b += count;
      },
      [actionTypes.c]: (state, { x, y }) => {
        state.c += x + y;
      }
    });

    // Act
    const a = reducer(undefined, actions.a());
    const b = reducer(a, actions.b(10));
    const actual = reducer(b, actions.c(2, 3));

    // Assert
    expect(a === b).toBe(false);
    expect(b === actual).toBe(false);
    expect(actual === initialState).toBe(false);
    expect(actual).toEqual({ a: 1, b: 10, c: 5 });
  });
});
