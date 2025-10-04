import { field, variant } from "@dao-xyz/borsh";
import { Documents, SearchRequest } from "@peerbit/document";
import { Program, type ProgramEvents } from "@peerbit/program";
import { Peerbit } from "peerbit";
import { sha256Sync } from "@peerbit/crypto";
import { useEffect, useState, useCallback } from "react";
import { v4 as uuid } from "uuid";
import "./App.css";

// Enhanced Post class with more blog-like properties
@variant(0) // version 0
class Post {
  @field({ type: "string" })
  id: string;

  @field({ type: "string" })
  title: string;

  @field({ type: "string" })
  content: string;

  @field({ type: "string" })
  author: string;

  @field({ type: "u64" })
  timestamp: bigint;

  constructor(title: string, content: string, author: string) {
    this.id = uuid();
    this.title = title;
    this.content = content;
    this.author = author;
    this.timestamp = BigInt(Date.now());
  }
}

// IndexedPost class for better indexing and searching
class IndexedPost {
  @field({ type: "string" })
  id: string;

  @field({ type: "string" })
  title: string;

  @field({ type: "string" })
  content: string;

  @field({ type: "string" })
  author: string;

  @field({ type: "u64" })
  timestamp: bigint;

  @field({ type: Uint8Array })
  from: Uint8Array; // Public key of the post creator

  @field({ type: "u64" })
  modified: bigint; // When the post was added to the log

  constructor(post: Post, from: Uint8Array, modified: bigint) {
    this.id = post.id;
    this.title = post.title;
    this.content = post.content;
    this.author = post.author;
    this.timestamp = post.timestamp;
    this.from = from;
    this.modified = modified;
  }
}

// This class extends Program which allows it to be replicated amongst peers
@variant("posts")
class PostsDB extends Program {
  @field({ type: Documents })
  posts: Documents<Post, IndexedPost>; // Documents<?> provide document store functionality around your Posts

  constructor() {
    super();
    // Use deterministic ID so all peers connect to the same database
    this.posts = new Documents({
      id: sha256Sync(new TextEncoder().encode("dapptoon-posts"))
    });
  }

  /**
   * Implement open to control what things are to be done on 'open'
   */
  async open(): Promise<void> {
    // We need to setup the store in the setup hook
    // we can also modify properties of our store here, for example set access control
    await this.posts.open({
      type: Post,
      
      // Configure indexing with transform function
      index: {
        idProperty: "id",
        type: IndexedPost,
        transform: async (post: Post, context) => {
          const entry = await this.posts.log.log.get(context.head);
          const publicKey = entry?.signatures?.[0]?.publicKey?.bytes || new Uint8Array();
          return new IndexedPost(post, publicKey, context.modified);
        },
        canRead: (post, publicKey) => true,
        canSearch: (query, publicKey) => true,
      },

      // Configure replication settings
      replicas: {
        min: 2, // Require at least 2 replicas
        max: undefined, // No upper limit
      },
      
      // Allow anyone to replicate
      canReplicate: (publicKey) => true,
      
      // Allow all operations
      canPerform: (properties) => true,
    });
  }
}

interface AppState {
  peer: Peerbit | null;
  store: PostsDB | null;
  posts: Post[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connectedPeers: number;
  deletingPostIds: Record<string, boolean>;
}

export function App() {
  const [state, setState] = useState<AppState>({
    peer: null,
    store: null,
    posts: [],
    isConnected: false,
    isLoading: true,
    error: null,
    connectedPeers: 0,
    deletingPostIds: {},
  });

  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    author: "",
  });

  // Initialize peer connection and database
  const initializePeer = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Create peer with persistent storage
      const peer = await Peerbit.create({
        directory: "./dapptoon-data"
      });

      // Bootstrap to connect to the network
      await peer.bootstrap();

      // Open the posts database with replication factor
      const postsDB = new PostsDB();
      const store = await peer.open(postsDB as any) as unknown as PostsDB;

      // Set up peer connection monitoring
      const updateConnectedPeers = () => {
        const connections = peer.libp2p.getConnections();
        setState(prev => ({ ...prev, connectedPeers: connections.length }));
      };

      peer.libp2p.addEventListener('peer:connect', updateConnectedPeers);
      peer.libp2p.addEventListener('peer:disconnect', updateConnectedPeers);

      setState(prev => ({
        ...prev,
        peer,
        store,
        isConnected: true,
        isLoading: false,
        connectedPeers: peer.libp2p.getConnections().length,
      }));

      // Load existing posts
      await loadPosts(store);

      // Set up real-time updates by watching for changes
      store.posts.events.addEventListener('change', async () => {
        console.log('Posts changed, reloading...');
        await loadPosts(store);
      });

      // Also listen for log changes (new entries from peers)
      store.posts.log.events.addEventListener('join', async () => {
        console.log('New peer joined, reloading posts...');
        await loadPosts(store);
      });

      // Set up periodic refresh to ensure we get updates from peers
      const refreshInterval = setInterval(async () => {
        console.log('Periodic refresh of posts...');
        await loadPosts(store);
      }, 10000); // Refresh every 10 seconds

      // Store the interval ID for cleanup
      (store as any).refreshInterval = refreshInterval;

    } catch (error) {
      console.error("Failed to initialize peer:", error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to initialize peer",
        isLoading: false,
      }));
    }
  }, []);

  // Load posts from the database
  const loadPosts = useCallback(async (store: PostsDB) => {
    try {
      const responses: Post[] = await store.posts.index.search(
        new SearchRequest({
          query: [], // query all
        }),
        {
          local: true,
          remote: { 
            replicate: true, // Sync and replicate remote content locally
            timeout: 5000, // 5 second timeout for remote queries
          }
        }
      );

      // Sort posts by timestamp (newest first)
      const sortedPosts = responses.sort((a, b) => 
        Number(b.timestamp - a.timestamp)
      );

      console.log(`Loaded ${sortedPosts.length} posts`);
      setState(prev => ({ ...prev, posts: sortedPosts }));
    } catch (error) {
      console.error("Failed to load posts:", error);
      setState(prev => ({
        ...prev,
        error: "Failed to load posts: " + (error instanceof Error ? error.message : String(error))
      }));
    }
  }, []);

  // Create a new post
  const createPost = useCallback(async () => {
    if (!state.store || !newPost.title.trim() || !newPost.content.trim() || !newPost.author.trim()) {
      return;
    }

    try {
      const post = new Post(newPost.title.trim(), newPost.content.trim(), newPost.author.trim());
      
      // Put the post with high replication degree for better distribution
      await state.store.posts.put(post, {
        replicas: 3, // Ensure this post is replicated to at least 3 peers
        unique: true, // Skip duplicate check since we're using UUIDs
      });
      
      console.log('Post created:', post.id);
      
      // Clear the form
      setNewPost({ title: "", content: "", author: "" });
      
      // Reload posts after a short delay to allow for replication
      setTimeout(async () => {
        await loadPosts(state.store!);
      }, 500);
    } catch (error) {
      console.error("Failed to create post:", error);
      setState(prev => ({
        ...prev,
        error: "Failed to create post"
      }));
    }
  }, [state.store, newPost, loadPosts]);

  // Delete an existing post
  const deletePost = useCallback(async (postId: string) => {
    const store = state.store;
    if (!store || !postId) {
      return;
    }

    // Track deletion state
    setState(prev => ({
      ...prev,
      error: null,
      deletingPostIds: { ...prev.deletingPostIds, [postId]: true },
    }));

    try {
      await store.posts.del(postId);

      // Reload posts after a short delay to allow for propagation
      setTimeout(async () => {
        await loadPosts(store);
      }, 300);
    } catch (error) {
      console.error("Failed to delete post:", error);
      setState(prev => ({
        ...prev,
        error: "Failed to delete post",
      }));
    } finally {
      setState(prev => {
        const { [postId]: _removed, ...remaining } = prev.deletingPostIds;
        return {
          ...prev,
          deletingPostIds: remaining,
        };
      });
    }
  }, [state.store, loadPosts]);

  // Initialize on component mount
  useEffect(() => {
    initializePeer();

    // Cleanup on unmount
    return () => {
      if (state.store && (state.store as any).refreshInterval) {
        clearInterval((state.store as any).refreshInterval);
      }
      if (state.peer) {
        state.peer.stop().catch(console.error);
      }
    };
  }, []);

  // Format timestamp for display
  const formatTimestamp = (timestamp: bigint) => {
    return new Date(Number(timestamp)).toLocaleString();
  };

  if (state.isLoading) {
    return (
      <div className="app app--loading">
        <div className="loading-panel">
          <div className="loading-spinner" />
          <p className="loading-text">Connecting to Peerbit network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="container">
          <div className="header__bar">
            <h1 className="logo">Dapptoon P2P Blog</h1>
            <div className="status">
              <div className="status__cluster">
                <span
                  className={`status__indicator ${state.isConnected ? "status__indicator--online" : "status__indicator--offline"}`}
                />
                <span className="status__label">
                  {state.isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="status__peers">Peers: {state.connectedPeers}</div>
            </div>
          </div>
          {state.error && (
            <div className="alert alert--error">{state.error}</div>
          )}
        </div>
      </header>

      <main className="app__main">
        <div className="container">
          <section className="panel panel--form">
            <h2 className="panel__title">Create New Post</h2>
            <div className="form">
              <input
                type="text"
                placeholder="Your name"
                value={newPost.author}
                onChange={(e) => setNewPost(prev => ({ ...prev, author: e.target.value }))}
                className="field"
              />
              <input
                type="text"
                placeholder="Post title"
                value={newPost.title}
                onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                className="field"
              />
              <textarea
                placeholder="Write your post content..."
                value={newPost.content}
                onChange={(e) => setNewPost(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
                className="field field--textarea"
              />
              <button
                onClick={createPost}
                disabled={!newPost.title.trim() || !newPost.content.trim() || !newPost.author.trim()}
                className="button button--primary"
              >
                Publish Post
              </button>
            </div>
          </section>

          <section className="panel panel--posts">
            <div className="panel__heading">
              <h2 className="section-title">Recent Posts ({state.posts.length})</h2>
            </div>

            {state.posts.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__text">No posts yet. Be the first to create one!</p>
              </div>
            ) : (
              <div className="posts">
                {state.posts.map((post) => (
                  <article key={post.id} className="post-card">
                    <header className="post-card__header">
                      <div className="post-card__header-main">
                        <h3 className="post-card__title">{post.title}</h3>
                        <div className="post-card__meta">
                          <span className="post-card__author">By {post.author}</span>
                          <span className="post-card__dot">•</span>
                          <span className="post-card__time">{formatTimestamp(post.timestamp)}</span>
                        </div>
                      </div>
                      <button
                        className="button button--danger post-card__delete"
                        disabled={!!state.deletingPostIds[post.id]}
                        type="button"
                        onClick={() => {
                          if (window.confirm("Delete this post? This action cannot be undone.")) {
                            deletePost(post.id);
                          }
                        }}
                        aria-label={`Delete post titled ${post.title}`}
                      >
                        {state.deletingPostIds[post.id] ? "Deleting..." : "Delete"}
                      </button>
                    </header>
                    <div className="post-card__content">{post.content}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
