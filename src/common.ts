export interface EmptyAction<T extends string> {
  readonly type: T;
  readonly payload?: undefined;
}

export interface PayloadAction<T extends string, P> {
  readonly type: T;
  readonly payload: P;
}

export type Action<T extends string, P = void> = P extends never
  ? EmptyAction<T>
  : PayloadAction<T, P>;
