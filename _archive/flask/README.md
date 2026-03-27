# Legal Case Manager

A comprehensive case management application for lawyers to track cases, hearings, and case progress. Built specifically for Indian legal practice.

## Features

### 📁 Case Management
- Add and manage unlimited cases
- Track case details including:
  - Case number, title, and type
  - Court name and jurisdiction
  - Filing date and current stage
  - Client and opponent information
  - Case priority levels (High, Medium, Low)
  - Detailed notes and remarks
- Filter cases by status (Active, Pending, On Hold, Closed)
- Search functionality across cases
- Complete case timeline and history

### 📅 Hearing Calendar
- Schedule and track all hearings
- View upcoming hearings with countdown
- Categorize hearings by type:
  - First Hearing
  - Regular Hearing
  - Evidence
  - Arguments
  - Final Arguments
  - Judgment
  - Mention
  - Miscellaneous
- Record hearing outcomes and next dates
- Court room and judge information
- Hearing notes and preparation reminders

### 📊 Dashboard
- Quick overview of your practice
- Total and active case counts
- Upcoming hearings summary
- Case status breakdown
- Recent case activities

### 🔍 Advanced Features
- Case priority management
- Automatic case timeline generation
- Search and filter capabilities
- Responsive design for mobile and desktop
- Clean, professional interface
- SQLite database for reliable data storage

## Installation

### Prerequisites
- Python 3.7 or higher installed on your computer
- Basic familiarity with command line/terminal

### Step 1: Download the Application
1. Save all the application files to a folder on your computer (e.g., `LegalCaseManager`)

### Step 2: Install Python Dependencies
Open your terminal/command prompt, navigate to the application folder, and run:

```bash
pip install -r requirements.txt
```

Or install Flask directly:
```bash
pip install Flask
```

### Step 3: Run the Application
In the terminal, navigate to the application folder and run:

```bash
python app.py
```

You should see output similar to:
```
============================================================
Legal Case Manager - Starting Application
============================================================

Initializing database...
✓ Database initialized successfully

Starting web server...

🌐 Application running at: http://127.0.0.1:5000

Press CTRL+C to stop the server
============================================================
```

### Step 4: Access the Application
Open your web browser and go to:
```
http://127.0.0.1:5000
```

## Usage Guide

### Adding a New Case
1. Navigate to the "Cases" page
2. Click the "Add New Case" button
3. Fill in the required information:
   - Case Number (unique identifier)
   - Case Title
   - Case Type (Civil, Criminal, Family, etc.)
   - Court Name
   - Filing Date
   - Current Stage
   - Status
   - Client Information
4. Optionally add:
   - Opponent details
   - Priority level
   - Notes
5. Click "Save Case"

### Scheduling a Hearing
1. Navigate to the "Hearings" page
2. Click "Schedule Hearing"
3. Select the case from the dropdown
4. Enter hearing details:
   - Date and Time
   - Hearing Type
   - Court Room
   - Purpose
   - Judge Name (if known)
5. Add any preparation notes
6. Click "Save Hearing"

### Viewing Case Details
1. Go to the "Cases" page
2. Click "View" on any case
3. You'll see:
   - Complete case information
   - All scheduled hearings
   - Case timeline
   - Options to edit or schedule hearings

### Updating Case Information
1. View the case details
2. Click "Edit Case"
3. Modify the necessary fields
4. Click "Save Case"

### Recording Hearing Outcomes
1. Go to the "Hearings" page
2. Click "Edit" on the completed hearing
3. Enter the outcome in the "Outcome" field
4. If applicable, enter the next hearing date
5. Click "Save Hearing"

## Database

The application uses SQLite database stored in `legal_case_manager.db` file. This file contains all your case data and is created automatically when you first run the application.

### Backup Your Data
To backup your data, simply copy the `legal_case_manager.db` file to a safe location.

### Restore Data
To restore data, replace the `legal_case_manager.db` file with your backup.

## File Structure

```
LegalCaseManager/
├── app.py                          # Main application file
├── requirements.txt                # Python dependencies
├── legal_case_manager.db          # Database (created automatically)
├── templates/                     # HTML templates
│   ├── base.html                 # Base template
│   ├── dashboard.html            # Dashboard page
│   ├── cases.html                # Cases management page
│   └── hearings.html             # Hearings calendar page
└── static/                       # Static files
    ├── css/
    │   └── style.css            # Stylesheet
    └── js/                      # JavaScript files (if any)
```

## Customization

### Case Types
To add custom case types, edit the `case_type` dropdown in `templates/cases.html`:
```html
<select name="case_type" class="form-select" required>
    <option value="">Select Type</option>
    <option value="Your Custom Type">Your Custom Type</option>
    <!-- Add more types here -->
</select>
```

### Case Stages
To customize case stages, edit the `current_stage` dropdown in `templates/cases.html`.

### Hearing Types
To add custom hearing types, edit the `hearing_type` dropdown in `templates/hearings.html`.

## Troubleshooting

### Application won't start
- Ensure Python is installed: `python --version`
- Ensure Flask is installed: `pip list | grep Flask`
- Check for port conflicts (port 5000 must be available)

### Can't access the application
- Ensure the application is running (check terminal)
- Try accessing `http://localhost:5000` instead
- Check your firewall settings

### Database errors
- Delete `legal_case_manager.db` to start fresh (you'll lose data)
- Ensure you have write permissions in the application folder

### Browser compatibility
- Use modern browsers: Chrome, Firefox, Safari, or Edge
- Clear browser cache if experiencing issues

## Security Notes

- This application is designed for **local personal use only**
- Do not expose it to the internet without proper security measures
- The database is stored locally and is not encrypted
- For production use, implement:
  - User authentication
  - HTTPS/SSL
  - Database encryption
  - Access controls
  - Regular backups

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the usage guide
3. Ensure all dependencies are correctly installed

## License

This application is provided as-is for personal use. Feel free to modify and customize it according to your needs.

## Version

Version 1.0.0 - Initial Release

---

**Note**: This application is designed for personal case management and should not be used as the sole system for critical legal documentation. Always maintain proper backups and official records as per legal requirements.
