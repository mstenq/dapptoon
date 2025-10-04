import { field, variant } from "@dao-xyz/borsh";
import { Documents, SearchRequest } from "@peerbit/document";
import { Program, type ProgramEvents } from "@peerbit/program";
import { Peerbit } from "peerbit";
import { sha256Sync } from "@peerbit/crypto";
import { useEffect, useState, useCallback } from "react";
import { v4 as uuid } from "uuid";

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to Peerbit network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Dapptoon P2P Blog</h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${state.isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {state.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Peers: {state.connectedPeers}
              </div>
            </div>
          </div>
          {state.error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {state.error}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Create Post Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Post</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your name"
              value={newPost.author}
              onChange={(e) => setNewPost(prev => ({ ...prev, author: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Post title"
              value={newPost.title}
              onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Write your post content..."
              value={newPost.content}
              onChange={(e) => setNewPost(prev => ({ ...prev, content: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createPost}
              disabled={!newPost.title.trim() || !newPost.content.trim() || !newPost.author.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Publish Post
            </button>
          </div>
        </div>

        {/* Posts List */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Recent Posts ({state.posts.length})</h2>
          
          {state.posts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <p className="text-gray-500">No posts yet. Be the first to create one!</p>
            </div>
          ) : (
            state.posts.map((post) => (
              <article key={post.id} className="bg-white rounded-lg shadow-sm p-6">
                <header className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{post.title}</h3>
                  <div className="flex items-center text-sm text-gray-500 space-x-4">
                    <span>By {post.author}</span>
                    <span>•</span>
                    <span>{formatTimestamp(post.timestamp)}</span>
                  </div>
                </header>
                <div className="prose prose-gray max-w-none">
                  <p className="whitespace-pre-wrap">{post.content}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
