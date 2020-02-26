export interface IdSelector<P> {
  (props: P): string;
}

export interface EqualityFn {
  (a: any, b: any): boolean;
}

export type SimpleSelector<S, R> = (state: S) => R;
export type CompositeSelector<S, P, R> = (state: S, props: P) => R;

export interface SelectorProps<S, P> {
  idSelectors?: IdSelectors<S, P>;
}

export interface IdSelectors<S, P> extends Array<CompositeSelector<S, P, string>> {}

export type Selector<S, P, R> = SelectorProps<S, P> & (SimpleSelector<S, R> | CompositeSelector<S, P, R>);

export function createIdSelector<P>(fn: IdSelector<P>): CompositeSelector<void, P, string> {
  const res: any = (_: any, props: P) => fn(props);
  res.idSelectors = [res];
  return res;
}

export function createSelector<D extends Dependencies, R>(
  dependencies: D,
  combiner: Combiner<D, R>,
  equalityFn?: EqualityFn
): Selector<State<D>, Props<D>, R> {
  const idSelectors = getIdSelectors(dependencies);
  if (idSelectors.length > 0) {
    return makeInstanceSelector(dependencies, combiner, equalityFn, idSelectors);
  }

  const cache: Cache<R> = [undefined, undefined!];
  return makeComputeFn(dependencies, combiner, equalityFn, () => cache);
}

const emptyArray: any[] = [];
function getIdSelectors<D extends Dependencies>(dependencies: D): IdSelectors<State<D>, Props<D>> {
  return [...new Set(dependencies.flatMap(dep => dep.idSelectors || emptyArray))];
}

function makeComputeFn<D extends Dependencies, R>(
  dependencies: D,
  combiner: Combiner<D, R>,
  equalityFn: EqualityFn | undefined,
  getCache: (state: State<D>, props: Props<D>) => Cache<R>
) {
  const computeResult = (state: State<D>, props: Props<D>) => {
    const cache = getCache(state, props);
    let prevArgs = cache[0];
    const previousResult = cache[1];

    let recompute = false;
    if (!prevArgs) {
      recompute = true;
      cache[0] = prevArgs = [];
    }

    for (let i = 0; i < dependencies.length; i++) {
      const currentArg = dependencies[i](state, props);
      recompute = recompute || prevArgs[i] !== currentArg;
      prevArgs[i] = currentArg;
    }

    if (!recompute) {
      return previousResult;
    }

    const result = combiner(...(prevArgs as any));
    return (cache[1] = equalityFn && equalityFn(result, previousResult) ? previousResult : result);
  };
  return computeResult;
}

function makeInstanceSelector<D extends Dependencies, R>(
  dependencies: D,
  combiner: Combiner<D, R>,
  equalityFn: EqualityFn | undefined,
  idSelectors: IdSelectors<State<D>, Props<D>>
): CompositeSelector<State<D>, Props<D>, R> {
  let cache: Record<any, any> = {};

  const result: any = makeComputeFn(dependencies, combiner, equalityFn, (state, props) => {
    const lastSelectorIndex = idSelectors.length - 1;
    const id = lastSelectorIndex >= 0 ? idSelectors[lastSelectorIndex](state, props) : "";

    let currentCache = cache;
    for (let i = 0; i < lastSelectorIndex; i++) {
      const currentId = idSelectors[i](state, props);
      currentCache = currentCache[currentId] || (currentCache[currentId] = {});
    }

    return currentCache[id] || (currentCache[id] = [undefined, undefined]);
  });
  result.idSelectors = idSelectors;

  return result;
}

type Cache<R> = [unknown[] | undefined, R];

type Dependencies = [Selector<any, any, any>, ...Array<Selector<any, any, any>>];

type DependencyResults<D extends any[]> = {
  [K in keyof D]: D[K] extends Selector<any, any, infer R> ? R : never;
};

type Combiner<D extends any[], R> = (...results: DependencyResults<D>) => R;

type UnionToIntersection<U> = (U extends any
? (k: U) => void
: never) extends (k: infer I) => void
  ? I
  : never;

type Props<D extends any[]> = UnionToIntersection<
  {
    [K in keyof D]: D[K & number] extends Selector<any, infer P, any> ? P : never;
  }[number]
>;

type State<D extends any[]> = {
  [K in keyof D]: D[K] extends Selector<infer S, any, any> ? (S extends void ? never : S) : never;
}[number];
