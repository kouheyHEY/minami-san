import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
} from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { gameActions, gameStore } from './game/store'
import { GamePage } from './screens/GamePage'
import { RulesPage } from './screens/RulesPage'

function SoundToggle() {
  const soundOn = useSelector(gameStore, (state) => state.soundOn)
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label="効果音"
      aria-pressed={soundOn}
      onClick={gameActions.toggleSound}
    >
      {soundOn ? '音 ON' : '音 OFF'}
    </button>
  )
}

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="みなみ算 ホーム">
          <span className="brand-mark">算</span>
          <span>みなみ算</span>
        </Link>
        <nav aria-label="メインナビゲーション">
          <Link to="/" activeProps={{ className: 'active' }}>ゲーム</Link>
          <Link to="/rules" activeProps={{ className: 'active' }}>遊び方</Link>
          <SoundToggle />
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: GamePage,
})
const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rules',
  component: RulesPage,
})

const routeTree = rootRoute.addChildren([gameRoute, rulesRoute])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
