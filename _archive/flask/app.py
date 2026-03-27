from flask import Flask, render_template, request, jsonify, redirect, url_for
from datetime import datetime, timedelta
import sqlite3
import json
from functools import wraps

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'

DATABASE = 'legal_case_manager.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with required tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Cases table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE NOT NULL,
            case_title TEXT NOT NULL,
            case_type TEXT NOT NULL,
            court_name TEXT NOT NULL,
            filing_date TEXT NOT NULL,
            current_stage TEXT NOT NULL,
            status TEXT NOT NULL,
            client_name TEXT NOT NULL,
            client_contact TEXT,
            opponent_name TEXT,
            opponent_advocate TEXT,
            case_priority TEXT DEFAULT 'Medium',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    
    # Hearings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hearings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            hearing_date TEXT NOT NULL,
            hearing_time TEXT,
            hearing_type TEXT NOT NULL,
            purpose TEXT,
            court_room TEXT,
            judge_name TEXT,
            outcome TEXT,
            next_date TEXT,
            notes TEXT,
            reminder_sent INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
        )
    ''')
    
    # Documents table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            document_name TEXT NOT NULL,
            document_type TEXT NOT NULL,
            filing_date TEXT,
            description TEXT,
            file_path TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
        )
    ''')
    
    # Case history/timeline table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS case_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            event_date TEXT NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    """Dashboard view"""
    return render_template('dashboard.html')

@app.route('/api/dashboard/stats')
def dashboard_stats():
    """Get dashboard statistics"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Total cases
    cursor.execute('SELECT COUNT(*) as count FROM cases')
    total_cases = cursor.fetchone()['count']
    
    # Active cases
    cursor.execute("SELECT COUNT(*) as count FROM cases WHERE status = 'Active'")
    active_cases = cursor.fetchone()['count']
    
    # Upcoming hearings (next 7 days)
    today = datetime.now().strftime('%Y-%m-%d')
    week_later = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    cursor.execute('''
        SELECT COUNT(*) as count FROM hearings 
        WHERE hearing_date BETWEEN ? AND ? AND outcome IS NULL
    ''', (today, week_later))
    upcoming_hearings = cursor.fetchone()['count']
    
    # Cases by status
    cursor.execute('SELECT status, COUNT(*) as count FROM cases GROUP BY status')
    status_breakdown = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        'total_cases': total_cases,
        'active_cases': active_cases,
        'upcoming_hearings': upcoming_hearings,
        'status_breakdown': status_breakdown
    })

@app.route('/cases')
def cases():
    """Cases list view"""
    return render_template('cases.html')

@app.route('/api/cases', methods=['GET', 'POST'])
def api_cases():
    """API endpoint for cases"""
    conn = get_db()
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        try:
            cursor.execute('''
                INSERT INTO cases (
                    case_number, case_title, case_type, court_name, filing_date,
                    current_stage, status, client_name, client_contact, opponent_name,
                    opponent_advocate, case_priority, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data['case_number'], data['case_title'], data['case_type'],
                data['court_name'], data['filing_date'], data['current_stage'],
                data['status'], data['client_name'], data.get('client_contact', ''),
                data.get('opponent_name', ''), data.get('opponent_advocate', ''),
                data.get('case_priority', 'Medium'), data.get('notes', ''),
                now, now
            ))
            
            case_id = cursor.lastrowid
            
            # Add to timeline
            cursor.execute('''
                INSERT INTO case_timeline (case_id, event_date, event_type, description, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (case_id, data['filing_date'], 'Case Filed', 
                  f"Case {data['case_number']} filed in {data['court_name']}", now))
            
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'case_id': case_id}), 201
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'Case number already exists'}), 400
    
    # GET request
    cursor.execute('SELECT * FROM cases ORDER BY created_at DESC')
    cases = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(cases)

@app.route('/api/cases/<int:case_id>', methods=['GET', 'PUT', 'DELETE'])
def api_case(case_id):
    """API endpoint for single case"""
    conn = get_db()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute('SELECT * FROM cases WHERE id = ?', (case_id,))
        case = cursor.fetchone()
        
        if not case:
            conn.close()
            return jsonify({'error': 'Case not found'}), 404
        
        # Get hearings
        cursor.execute('''
            SELECT * FROM hearings WHERE case_id = ? ORDER BY hearing_date DESC
        ''', (case_id,))
        hearings = [dict(row) for row in cursor.fetchall()]
        
        # Get documents
        cursor.execute('''
            SELECT * FROM documents WHERE case_id = ? ORDER BY created_at DESC
        ''', (case_id,))
        documents = [dict(row) for row in cursor.fetchall()]
        
        # Get timeline
        cursor.execute('''
            SELECT * FROM case_timeline WHERE case_id = ? ORDER BY event_date DESC
        ''', (case_id,))
        timeline = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'case': dict(case),
            'hearings': hearings,
            'documents': documents,
            'timeline': timeline
        })
    
    elif request.method == 'PUT':
        data = request.json
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute('''
            UPDATE cases SET
                case_title = ?, case_type = ?, court_name = ?,
                current_stage = ?, status = ?, client_name = ?,
                client_contact = ?, opponent_name = ?, opponent_advocate = ?,
                case_priority = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ''', (
            data['case_title'], data['case_type'], data['court_name'],
            data['current_stage'], data['status'], data['client_name'],
            data.get('client_contact', ''), data.get('opponent_name', ''),
            data.get('opponent_advocate', ''), data.get('case_priority', 'Medium'),
            data.get('notes', ''), now, case_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM cases WHERE id = ?', (case_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/hearings')
def hearings():
    """Hearings calendar view"""
    return render_template('hearings.html')

@app.route('/api/hearings', methods=['GET', 'POST'])
def api_hearings():
    """API endpoint for hearings"""
    conn = get_db()
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute('''
            INSERT INTO hearings (
                case_id, hearing_date, hearing_time, hearing_type, purpose,
                court_room, judge_name, outcome, next_date, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['case_id'], data['hearing_date'], data.get('hearing_time', ''),
            data['hearing_type'], data.get('purpose', ''), data.get('court_room', ''),
            data.get('judge_name', ''), data.get('outcome', ''), data.get('next_date', ''),
            data.get('notes', ''), now
        ))
        
        hearing_id = cursor.lastrowid
        
        # Add to case timeline
        cursor.execute('SELECT case_number FROM cases WHERE id = ?', (data['case_id'],))
        case = cursor.fetchone()
        
        cursor.execute('''
            INSERT INTO case_timeline (case_id, event_date, event_type, description, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (data['case_id'], data['hearing_date'], 'Hearing Scheduled',
              f"{data['hearing_type']} scheduled", now))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'hearing_id': hearing_id}), 201
    
    # GET request - optionally filter by case_id
    case_id = request.args.get('case_id')
    
    if case_id:
        cursor.execute('''
            SELECT h.*, c.case_number, c.case_title, c.court_name
            FROM hearings h
            JOIN cases c ON h.case_id = c.id
            WHERE h.case_id = ?
            ORDER BY h.hearing_date DESC
        ''', (case_id,))
    else:
        cursor.execute('''
            SELECT h.*, c.case_number, c.case_title, c.court_name
            FROM hearings h
            JOIN cases c ON h.case_id = c.id
            ORDER BY h.hearing_date DESC
        ''')
    
    hearings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(hearings)

@app.route('/api/hearings/<int:hearing_id>', methods=['PUT', 'DELETE'])
def api_hearing(hearing_id):
    """API endpoint for single hearing"""
    conn = get_db()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        data = request.json
        
        cursor.execute('''
            UPDATE hearings SET
                hearing_date = ?, hearing_time = ?, hearing_type = ?,
                purpose = ?, court_room = ?, judge_name = ?,
                outcome = ?, next_date = ?, notes = ?
            WHERE id = ?
        ''', (
            data['hearing_date'], data.get('hearing_time', ''),
            data['hearing_type'], data.get('purpose', ''),
            data.get('court_room', ''), data.get('judge_name', ''),
            data.get('outcome', ''), data.get('next_date', ''),
            data.get('notes', ''), hearing_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM hearings WHERE id = ?', (hearing_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/upcoming-hearings')
def upcoming_hearings():
    """Get upcoming hearings for calendar"""
    conn = get_db()
    cursor = conn.cursor()
    
    days = request.args.get('days', 30, type=int)
    today = datetime.now().strftime('%Y-%m-%d')
    future_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')
    
    cursor.execute('''
        SELECT h.*, c.case_number, c.case_title, c.court_name, c.case_priority
        FROM hearings h
        JOIN cases c ON h.case_id = c.id
        WHERE h.hearing_date BETWEEN ? AND ?
        AND h.outcome IS NULL
        ORDER BY h.hearing_date ASC, h.hearing_time ASC
    ''', (today, future_date))
    
    hearings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(hearings)

if __name__ == '__main__':
    init_db()
    print("\n" + "="*60)
    print("Legal Case Manager - Starting Application")
    print("="*60)
    print("\nInitializing database...")
    print("✓ Database initialized successfully")
    print("\nStarting web server...")
    print("\n🌐 Application running at: http://127.0.0.1:5000")
    print("\nPress CTRL+C to stop the server")
    print("="*60 + "\n")
    app.run(debug=True, port=5000)
